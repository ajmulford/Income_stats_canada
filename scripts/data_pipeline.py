"""Build an offline, validated municipal census dataset from pinned official inputs."""

from __future__ import annotations

import argparse
from collections import Counter
import csv
from decimal import Decimal, InvalidOperation
import hashlib
import gzip
import shutil
import io
import json
from pathlib import Path
import subprocess
import tempfile
import zipfile
from xml.etree import ElementTree as ET

import geopandas as gpd
import pandas as pd
from pypdf import PdfReader
from shapely.geometry import Point

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw"
PROFILE_API = "https://api.statcan.gc.ca/census-recensement/profile/sdmx/rest/data"
PROFILE_ARCHIVE_MEMBER = "98-401-X2021006_English_CSV_data_Atlantic.csv"
PROFILE_HEADER = [
    "CENSUS_YEAR", "DGUID", "ALT_GEO_CODE", "GEO_LEVEL", "GEO_NAME", "TNR_SF", "TNR_LF",
    "DATA_QUALITY_FLAG", "CHARACTERISTIC_ID", "CHARACTERISTIC_NAME", "CHARACTERISTIC_NOTE",
    "C1_COUNT_TOTAL", "SYMBOL", "C2_COUNT_MEN+", "SYMBOL", "C3_COUNT_WOMEN+", "SYMBOL",
    "C10_RATE_TOTAL", "SYMBOL", "C11_RATE_MEN+", "SYMBOL", "C12_RATE_WOMEN+", "SYMBOL",
]


class ValidationError(ValueError):
    """Input cannot safely be used to produce the agreed dataset."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sources() -> list[dict]:
    return read_json(ROOT / "data/sources.lock.json")["sources"]


def verify_sources() -> None:
    for source in sources():
        path = RAW / source["file"]
        require(path.exists(), f"Missing {path}; run fetch first.")
        require(sha256(path) == source["sha256"], f"Source changed: {path}; review before updating lock.")


def restore_reviewed_snapshot(snapshot: Path, destination: Path, expected_sha256: str) -> None:
    """Restore exact reviewed bytes without accepting volatile live response headers."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent) as folder:
        temporary = Path(folder) / "snapshot"
        with gzip.open(snapshot, "rb") as source, temporary.open("wb") as output:
            shutil.copyfileobj(source, output)
        require(sha256(temporary) == expected_sha256,
                f"Reviewed snapshot changed: {snapshot}; restore the locked bytes.")
        temporary.replace(destination)


def fetch() -> None:
    """Cache only checksum-matching inputs; a changed live source requires review."""
    RAW.mkdir(parents=True, exist_ok=True)
    for source in sources():
        destination = RAW / source["file"]
        if destination.exists():
            require(sha256(destination) == source["sha256"], f"Cached source changed: {destination}")
            print(f"Verified {source['file']}", flush=True)
            continue
        snapshot = ROOT / "data/source-snapshots" / (source["file"] + ".gz")
        if snapshot.exists():
            restore_reviewed_snapshot(snapshot, destination, source["sha256"])
            print(f"Restored reviewed {source['file']}", flush=True)
            continue
        with tempfile.TemporaryDirectory(dir=RAW) as folder:
            temporary = Path(folder) / "download"
            subprocess.run([
                "curl", "--fail", "--location", "--silent", "--show-error", "--retry", "2",
                "--max-time", "300", "--output", str(temporary), source["url"],
            ], check=True)
            require(sha256(temporary) == source["sha256"],
                    f"Downloaded source changed: {source['file']}; review a new source snapshot.")
            temporary.replace(destination)
        print(f"Downloaded {source['file']}", flush=True)


def geosuite(name: str) -> list[dict]:
    with zipfile.ZipFile(RAW / "geosuite.zip") as archive:
        with io.TextIOWrapper(archive.open(f"2021_92-150-X_eng/{name}.csv"),
                              encoding="cp1252", newline="") as stream:
            return list(csv.DictReader(stream))


def csd_uid(row: dict) -> str:
    # Component codes are strings: leading zeroes are significant.
    return row["PRuid"] + row["CDcode"] + row["CSDcode"]


def unique_index(rows: list[dict], field: str) -> dict[str, dict]:
    result = {}
    for row in rows:
        key = row[field]
        require(key not in result, f"Duplicate {field}: {key}")
        result[key] = row
    return result


def extract_profile(config: dict, dguids: set[str]) -> list[list[str]]:
    """Stream the large CSV; retain only required characteristics and geographic IDs."""
    archive_hash = sha256(RAW / "profile-atlantic.zip")
    cache_key = hashlib.sha256(json.dumps({
        "archive": archive_hash, "dguids": sorted(dguids), "metric": config["income_characteristic_id"],
        "parser_version": 2,
    }, sort_keys=True).encode()).hexdigest()
    cache = ROOT / f"data/cache/profile-{cache_key}.json"
    if cache.exists():
        cached = read_json(cache)
        require(hashlib.sha256(json.dumps(cached["rows"], ensure_ascii=False).encode()).hexdigest()
                == cached["rows_sha256"], "Extracted profile cache checksum mismatch.")
        return cached["rows"]
    wanted = {"1", "4", "242", config["income_characteristic_id"]}
    result = []
    print("Streaming the Atlantic profile CSV (about 2.3 GB uncompressed)...", flush=True)
    with zipfile.ZipFile(RAW / "profile-atlantic.zip") as archive:
        with io.TextIOWrapper(archive.open(PROFILE_ARCHIVE_MEMBER), encoding="cp1252",
                              newline="") as stream:
            reader = csv.reader(stream)
            require(next(reader) == PROFILE_HEADER, "Unexpected profile CSV schema.")
            for row in reader:
                # The archive ends with a blank line and source attribution, not data records.
                if not row or not any(row) or row[0].startswith("Source:"):
                    continue
                require(len(row) == len(PROFILE_HEADER), "Malformed profile CSV record.")
                if row[1] in dguids and row[8] in wanted:
                    result.append(row)
    write_json(cache, {"rows": result, "rows_sha256":
                      hashlib.sha256(json.dumps(result, ensure_ascii=False).encode()).hexdigest()})
    return result


def parse_income(raw_value: str, symbol: str, flag: str) -> dict:
    """Decode the total-count symbol and short-form flags, never long-form income flags."""
    require(len(flag) == 5 and flag[0] in "012" and flag[1] in "0123459"
            and flag[2] in "09" and flag[3] in "0123459" and flag[4] in "09",
            f"Unknown geographic quality flag: {flag!r}")
    allowed = {"", "..", "...", "E", "F", "r", "x", "rE"}
    require(symbol in allowed, f"Unknown income symbol: {symbol!r}")
    unavailable = {"x": "suppressed", "F": "unreliable", "..": "unavailable", "...": "not_applicable"}
    if flag[0] == "1" or flag[1] == "9" or flag[2] == "9":
        require(not raw_value.strip(), "A suppressed short-form income unexpectedly has a value.")
        require(symbol in unavailable, "Suppressed income lacks an explanatory source symbol.")
    if symbol in unavailable:
        require(not raw_value.strip(), f"Unavailable income has a numeric value ({symbol}).")
        return {"median_household_income_cad": None, "availability_status": unavailable[symbol],
                "income_quality_caution": False, "income_quality_note": {
                    "x": "Suppressed by Statistics Canada for confidentiality.",
                    "F": "Statistics Canada considers this figure too unreliable to publish.",
                    "..": "Not available for the reference period.", "...": "Not applicable.",
                }[symbol]}
    require(bool(raw_value.strip()), "Income is blank without an explanatory source symbol.")
    try:
        value = Decimal(raw_value)
    except InvalidOperation as exc:
        raise ValidationError(f"Invalid income: {raw_value!r}") from exc
    require(value.is_finite() and value == value.to_integral_value(), "Income is not whole dollars.")
    caution = symbol in {"E", "rE"} or flag[1] == "5"
    notes = []
    if symbol in {"E", "rE"}:
        notes.append("Statistics Canada marks this income value 'use with caution'.")
    if flag[1] == "5":
        notes.append("Short-form total non-response is at least 50%; use with caution.")
    if symbol in {"r", "rE"}:
        notes.append("Statistics Canada revised this value.")
    if flag[0] == "2":
        notes.append("The geography excludes one or more incompletely enumerated reserves or settlements.")
    return {"median_household_income_cad": int(value), "availability_status": "available",
            "income_quality_caution": caution, "income_quality_note": " ".join(notes)}


def profile_records(rows: list[list[str]], config: dict) -> dict[str, dict[str, list[str]]]:
    result = {}
    for row in rows:
        require(len(row) == len(PROFILE_HEADER), "Malformed extracted record.")
        require(row[0] == str(config["census_year"]), "Unexpected census year.")
        geo = result.setdefault(row[1], {})
        require(row[8] not in geo, f"Duplicate profile characteristic: {row[1]} / {row[8]}")
        geo[row[8]] = row
        if row[8] == config["income_characteristic_id"]:
            require(row[9].strip() == config["income_characteristic_name"], "Income variable changed.")
    return result


def check_samples(records: dict, config: dict) -> list[dict]:
    """Compare bulk extraction to separately retrieved official SDMX census profiles."""
    with (RAW / "profile-samples.csv").open(encoding="utf-8-sig", newline="") as stream:
        samples = list(csv.DictReader(stream))
    ns = {"s": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/structure",
          "c": "http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common"}
    metadata = ET.parse(RAW / "sample-api-metadata.xml")
    code = metadata.find(f".//s:Codelist[@id='CL_CHARACTERISTIC']/s:Code[@id='{config['sample_api_characteristic_id']}']", ns)
    require(code is not None and any(name.text == config["income_characteristic_name"]
                                    for name in code.findall("c:Name", ns)),
            "Independent API characteristic does not match the bulk income measure.")
    flag_symbols = {"": ""}
    for flag_code in metadata.findall(".//s:Codelist[@id='CL_FLAG']/s:Code", ns):
        for name in flag_code.findall("c:Name", ns):
            if name.attrib.get("{http://www.w3.org/XML/1998/namespace}lang") == "en" and (name.text or "").startswith("("):
                flag_symbols[flag_code.attrib["id"]] = name.text.split(")", 1)[0][1:]
    actual = unique_index(samples, "REF_AREA")
    expected = {"2021S0512" + uid for uid in config["sample_da_uids"]}
    require(set(actual) == expected, "Independent sample geographies differ from the configured set.")
    results = []
    for dguid in sorted(expected):
        sample = actual[dguid]
        require(sample["CHARACTERISTIC"] == config["sample_api_characteristic_id"], "Wrong sample metric.")
        require(sample["DATAFLOW"] == config["sample_api_dataflow"], "Unexpected API dataflow version.")
        require(sample["GENDER"] == "1" and sample["STATISTIC"] == "1"
                and sample["TIME_PERIOD"] == "2021", "Wrong sample dimensions.")
        row = records[dguid][config["income_characteristic_id"]]
        bulk = parse_income(row[11], row[12], row[7])
        raw = sample["OBS_VALUE"]
        require((Decimal(raw) if raw else None) == bulk["median_household_income_cad"],
                f"Independent sample income differs: {dguid}")
        require(sample["FLAG"] in flag_symbols, f"Unknown API flag: {sample['FLAG']}")
        require(flag_symbols[sample["FLAG"]] == row[12], f"Independent sample symbol differs: {dguid}")
        require(sample["DATA_QUALITY_FLAG"] == row[7], f"Independent geographic flag differs: {dguid}")
        results.append({"da_uid": row[2], "income_cad": bulk["median_household_income_cad"],
                        "symbol": row[12], "matched": True})
    return results


def build(config: dict, output: Path) -> dict:
    verify_sources()
    all_csds = geosuite("CSD")
    municipality = unique_index(all_csds, "CSDuid")[config["csd_uid"]]
    require(municipality["CSDdguid"] == config["csd_dguid"], "Municipal DGUID mismatch.")
    da_rows = sorted((r for r in geosuite("DA") if csd_uid(r) == config["csd_uid"]),
                     key=lambda r: r["DAuid"])
    da_index = unique_index(da_rows, "DAuid")
    require(bool(da_index), "Municipality has no dissemination areas.")
    expected_dguids = {r["DAdguid"] for r in da_rows} | {config["csd_dguid"]}
    records = profile_records(extract_profile(config, expected_dguids), config)
    require(set(records) == expected_dguids, "Missing or unexpected profile geographies.")
    for dguid, characteristics in records.items():
        require(set(characteristics) == {"1", "4", "242", config["income_characteristic_id"]},
                f"Missing profile characteristics for {dguid}")
    samples = check_samples(records, config)

    where = "DAUID IN (" + ",".join(f"'{uid}'" for uid in da_index) + ")"
    areas = gpd.read_file(RAW / "da-boundaries.zip", where=where).sort_values("DAUID")
    require(not areas.DAUID.duplicated().any(), "Duplicate DA boundaries.")
    require(set(areas.DAUID) == set(da_index), "DA boundaries and membership differ.")
    require(all(areas.geometry.notna() & ~areas.geometry.is_empty & areas.geometry.is_valid),
            "Invalid or empty DA geometry.")
    boundary = gpd.read_file(RAW / "csd-boundaries.zip", where=f"CSDUID = '{config['csd_uid']}'")
    require(len(boundary) == 1 and boundary.iloc[0].DGUID == config["csd_dguid"],
            "Municipal boundary identifier mismatch.")
    require(boundary.geometry.is_valid.all(), "Invalid municipal boundary.")
    require(areas.crs == boundary.crs and areas.crs.to_epsg() == 3347, "Unexpected source CRS.")
    union = areas.geometry.union_all()
    municipality_shape = boundary.geometry.iloc[0]
    symmetric_difference = union.symmetric_difference(municipality_shape).area
    overlap = float(areas.geometry.area.sum() - union.area)
    # Both are full statistical boundaries from the same vintage, not land-clipped outlines.
    require(symmetric_difference < 1, f"DA/municipal boundary mismatch: {symmetric_difference} m²")
    require(abs(overlap) < 1, f"Overlapping DA interiors: {overlap} m²")
    require(sum(int(r["DApop_2021"]) for r in da_rows) == int(municipality["CSDpop_2021"]),
            "DA population does not reconcile with municipality.")

    values = []
    for da in da_rows:
        uid, dguid = da["DAuid"], da["DAdguid"]
        geo = records[dguid]
        require(geo["1"][3] == "Dissemination area" and geo["1"][2] == uid,
                f"Profile geography identity differs: {uid}")
        require(int(geo["1"][11]) == int(da["DApop_2021"]), f"Population differs for {uid}")
        require(int(geo["4"][11]) == int(da["DAtdwell_2021"]), f"Dwelling count differs for {uid}")
        row = geo[config["income_characteristic_id"]]
        values.append({
            "da_uid": uid, "dguid": dguid, "csd_uid": config["csd_uid"],
            **parse_income(row[11], row[12], row[7]),
            "income_symbol": row[12], "geographic_quality_flag": row[7],
            "short_form_non_response_pct": float(row[5]),
            "long_form_non_response_pct": float(row[6]),
            "population_2021": int(da["DApop_2021"]),
            "total_private_dwellings_2021": int(da["DAtdwell_2021"]),
            "income_reference_year": config["income_reference_year"],
            "census_year": config["census_year"], "geography_vintage": config["geography_vintage"],
            "currency": "CAD", "characteristic_id": config["income_characteristic_id"],
            "source_url": f"{PROFILE_API}/STC_CP,DF_DA,1.3/A5.{dguid}.1.{config['sample_api_characteristic_id']}.1?format=csv",
            "source_catalogue_url": "https://www150.statcan.gc.ca/n1/en/catalogue/98-401-X2021006",
        })
    table = pd.DataFrame(values)
    table["median_household_income_cad"] = pd.array(table.median_household_income_cad, dtype="Int64")
    output.mkdir(parents=True, exist_ok=True)
    table.to_csv(output / "income.csv", index=False, lineterminator="\n")
    mapped = areas[["DAUID", "DGUID", "geometry"]].rename(columns={"DAUID": "da_uid", "DGUID": "dguid"})
    require(mapped.dguid.tolist() == [da_index[uid]["DAdguid"] for uid in mapped.da_uid],
            "DA boundary DGUID differs from GeoSuite.")
    mapped = mapped.merge(table, on=["da_uid", "dguid"], validate="one_to_one").to_crs(4326)
    # GeoJSON is an unsimplified milestone input, not the final mobile delivery format.
    (output / "income.geojson").write_text(mapped.to_json(drop_id=True), encoding="utf-8")
    (output / "municipality.geojson").write_text(boundary.to_crs(4326).to_json(drop_id=True))

    search = assess_search(config, mapped, output)
    metadata_text = "\n".join(page.extract_text() for page in PdfReader(RAW / "hrm-community-metadata.pdf").pages)
    require("community consultation" in metadata_text.lower(), "HRM metadata caveat changed; review source.")
    available = table.median_household_income_cad.dropna().astype(int)
    edges = config["proposed_band_edges_cad"]
    bounds = [None, *edges, None]
    bands = []
    for lower, upper in zip(bounds, bounds[1:]):
        count = sum((lower is None or value >= lower) and (upper is None or value < upper)
                    for value in available)
        bands.append({"lower_inclusive_cad": lower, "upper_exclusive_cad": upper, "areas": count})
    other_csds = [{"csd_uid": r["CSDuid"], "name": r["CSDname"], "type": r["CSDtype"],
                   "population": int(r["CSDpop_2021"])} for r in all_csds
                  if r["PRuid"] + r["CDcode"] == config["csd_uid"][:4]
                  and r["CSDuid"] != config["csd_uid"]]
    report = {
        "status": "validated" , "city": config["name"], "csd_uid": config["csd_uid"],
        "csd_dguid": config["csd_dguid"], "characteristic_id": config["income_characteristic_id"],
        "characteristic_name": config["income_characteristic_name"],
        "income_reference_year": config["income_reference_year"], "census_year": config["census_year"],
        "geography_vintage": config["geography_vintage"],
        "areas": len(table), "available": len(available),
        "availability_counts": dict(Counter(table.availability_status)),
        "suppressed_da_uids": table.loc[table.availability_status == "suppressed", "da_uid"].tolist(),
        "income_caution_count": int(table.income_quality_caution.sum()),
        "geographic_quality_flag_counts": dict(Counter(table.geographic_quality_flag)),
        "duplicate_records": 0, "unmatched_profiles": 0, "unmatched_boundaries": 0,
        "population_reconciled": int(table.population_2021.sum()),
        "boundary_symmetric_difference_m2": symmetric_difference, "da_overlap_m2": overlap,
        "excluded_separate_csds_in_halifax_cd": other_csds,
        "independent_profile_samples": samples,
        "income_distribution_cad": {"minimum": int(available.min()), "maximum": int(available.max()),
                                    "unweighted_da_quantiles": {
                                        str(q): float(available.quantile(q)) for q in [0.1, 0.25, 0.5, 0.75, 0.9]
                                    }},
        "proposed_bands_not_approved": bands,
        "search": search,
        "income_geojson_bytes": (output / "income.geojson").stat().st_size,
        "sources": sources(),
    }
    write_json(output / "validation.json", report)
    write_report(report, output / "validation.md")
    write_json(output / "artifacts.json", {
        "kind": "milestone-one-validated-build-not-published-release",
        "city": config["city"],
        "files": {p.name: {"sha256": sha256(p), "bytes": p.stat().st_size}
                  for p in sorted(output.iterdir()) if p.is_file() and p.name != "artifacts.json"},
    })
    print(f"Validated {len(table)} areas: {len(available)} published, {len(table)-len(available)} unavailable.")
    return report


def assess_search(config: dict, areas: gpd.GeoDataFrame, output: Path) -> dict:
    raw = read_json(RAW / "communities.geojson")
    count = read_json(RAW / "community-count.json")["count"]
    require(not raw.get("exceededTransferLimit"), "Community query was truncated.")
    require(len(raw["features"]) == count, "Community query does not match service count.")
    communities = gpd.GeoDataFrame.from_features(raw["features"], crs=4326)
    require(not communities.GSA_KEY.duplicated().any(), "Duplicate community identifiers.")
    require(set(communities.MUN_CODE) == {"HRM"}, "Unexpected community municipality.")
    valid = communities.geometry.notna() & ~communities.geometry.is_empty & communities.geometry.is_valid
    # Navigation assessment keeps invalid features explicit, never repairs them silently.
    invalid_names = communities.loc[~valid, "GSA_NAME"].tolist()
    projected_areas = areas.to_crs(3347)
    projected_communities = communities.loc[valid].to_crs(3347)
    matched = gpd.sjoin(projected_communities, projected_areas[["da_uid", "geometry"]],
                        how="left", predicate="intersects")
    intersections = []
    for _, community in communities.iterrows():
        linked = matched.loc[matched.GSA_KEY == community.GSA_KEY, "da_uid"].dropna()
        intersections.append({"community_id": str(community.GSA_KEY), "name": community.GSA_NAME,
                              "da_uids": sorted(set(linked)), "geometry_valid": bool(valid.loc[community.name]),
                              "source_remark": "" if pd.isna(community.GSA_REM) else str(community.GSA_REM).strip(),
                              "boundary_status": "official_current_civic_boundary_finality_not_certified"})
    write_json(output / "community-intersections.json", intersections)
    (output / "communities.geojson").write_text(json.dumps(raw, ensure_ascii=False))
    points = [r for r in geosuite("PN") if csd_uid(r) == config["csd_uid"]]
    unique_index(points, "PNuid")
    places = []
    for row in sorted(points, key=lambda r: (r["PNname"].casefold(), r["PNuid"])):
        lon, lat = float(row["PNrplong"]), float(row["PNrplat"])
        require(-180 <= lon <= 180 and -90 <= lat <= 90, "Invalid place coordinates.")
        hits = areas.loc[areas.geometry.covers(Point(lon, lat)), "da_uid"].tolist()
        places.append({"place_id": row["PNuid"], "name": row["PNname"], "longitude": lon,
                       "latitude": lat, "source_code": row["PNsource"],
                       "geosuite_geographic_type_code": row["dissolved_ga"],
                       "containing_da_uids": sorted(hits),
                       "resolution": "contained" if len(hits) == 1 else "unresolved_point", "aliases": []})
    write_json(output / "places.json", places)
    duplicates = {name: total for name, total in Counter(p["name"] for p in places).items() if total > 1}
    return {"community_features": count, "invalid_community_names": invalid_names,
            "community_names_without_da_intersection": [r["name"] for r in intersections if not r["da_uids"]],
            "place_points": len(places), "duplicate_place_names": duplicates,
            "unresolved_place_points": [p for p in places if p["resolution"] != "contained"],
            "source_caveat": "HRM metadata warns some civic boundaries await consultation; these are not neighbourhood boundaries.",
            "vintage_caveat": "Current HRM community boundaries support navigation over 2021 census areas; they are not 2021 income units."}


def write_report(report: dict, path: Path) -> None:
    d = report["income_distribution_cad"]
    lines = ["# HRM data validation", "", "Generated by `python -m scripts.data_pipeline build`.", "",
             f"Status: **{report['status']}** for the pinned inputs; this is not a published release.", "",
             f"Coverage: Halifax census subdivision `{report['csd_uid']}` / `{report['csd_dguid']}`.",
             f"Income: characteristic {report['characteristic_id']}, {report['characteristic_name']}; 100% data.",
             "Income year: 2020. Census and geography: 2021. Currency: CAD.", "",
             f"- Expected and matched dissemination areas: {report['areas']}.",
             f"- Published values: {report['available']}; availability: {report['availability_counts']}.",
             f"- Suppressed IDs: {', '.join(report['suppressed_da_uids'])}.",
             "- Duplicate, unmatched profile, and unmatched boundary records: 0.",
             f"- Reconciled 2021 municipal population: {report['population_reconciled']:,}.",
             f"- Municipal/DA union symmetric difference: {report['boundary_symmetric_difference_m2']:.6f} m².",
             f"- DA interior overlap: {report['da_overlap_m2']:.6f} m².",
             f"- Income-specific/short-form cautions: {report['income_caution_count']}.", "",
             "## Independent published-profile checks", "",
             "Bulk CSV values are compared with separately fetched official SDMX census profiles, including a suppressed value.", "",
             "| DA | Income (CAD) | Source symbol | Matched |", "| --- | ---: | --- | --- |"]
    for sample in report["independent_profile_samples"]:
        lines.append(f"| {sample['da_uid']} | {sample['income_cad'] if sample['income_cad'] is not None else 'unavailable'} | {sample['symbol'] or '(blank)'} | yes |")
    lines += ["", "## Geographic exclusions", "",
              "These separately enumerated census subdivisions in Halifax census division are outside the agreed Halifax municipal CSD membership:", ""]
    for csd in report["excluded_separate_csds_in_halifax_cd"]:
        lines.append(f"- {csd['name']} ({csd['csd_uid']}, {csd['type']}; population {csd['population']}).")
    lines += ["", "## Income distribution and proposed bands", "",
              f"Published DA medians range from ${d['minimum']:,} to ${d['maximum']:,}.",
              f"Unweighted quantiles of DA medians: {d['unweighted_da_quantiles']}.",
              "These describe the distribution of area medians, not the municipality's household-income distribution or median.", "",
              "Proposed bands are **not yet approved**. Lower bounds inclusive; upper bounds exclusive.", "",
              "| Lower CAD | Upper CAD | Areas |", "| ---: | ---: | ---: |"]
    for band in report["proposed_bands_not_approved"]:
        lines.append(f"| {band['lower_inclusive_cad'] if band['lower_inclusive_cad'] is not None else 'unbounded'} | {band['upper_exclusive_cad'] if band['upper_exclusive_cad'] is not None else 'unbounded'} | {band['areas']} |")
    search = report["search"]
    lines += ["", "## Search-source feasibility", "",
              f"- Official HRM community features: {search['community_features']} (verified against service count).",
              f"- Invalid community geometries: {search['invalid_community_names']}.",
              f"- Communities without an intersecting HRM DA: {search['community_names_without_da_intersection']}.",
              f"- GeoSuite place points: {search['place_points']}.",
              f"- Duplicate place names: {search['duplicate_place_names']}.",
              f"- Point locations requiring explicit handling: {len(search['unresolved_place_points'])} (see validation.json).",
              f"- {search['source_caveat']}", f"- {search['vintage_caveat']}", "",
              "## Delivery limits", "",
              f"Unsimplified income GeoJSON: {report['income_geojson_bytes']:,} bytes. Mobile delivery performance remains unmeasured.",
              "Search records are an assessed source inventory, not a curated final search index; aliases and boundary reliability need review.", "",
              "## Source snapshots", "",
              "SHA-256 checksums are enforced before building. Live changes require an explicit source-lock review.", ""]
    for source in report["sources"]:
        lines.append(f"- [{source['file']}]({source['url']}): `{source['sha256']}`.")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["fetch", "build", "verify"])
    parser.add_argument("--config", type=Path, default=ROOT / "config/hrm.json")
    parser.add_argument("--output", type=Path, default=ROOT / "data/processed/hrm")
    args = parser.parse_args()
    if args.command == "fetch":
        fetch()
    elif args.command == "verify":
        verify_sources()
        print("All source checksums match.")
    else:
        # Do not replace an existing validated dataset if any build check fails.
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=args.output.parent, prefix=".build-") as folder:
            stage = Path(folder)
            build(read_json(args.config), stage)
            args.output.mkdir(parents=True, exist_ok=True)
            for path in sorted(stage.iterdir(), key=lambda p: p.name == "validation.json"):
                path.replace(args.output / path.name)


if __name__ == "__main__":
    main()
