"""Regression checks for census interpretation and fail-closed data validation."""

import unittest
import csv
import gzip
import hashlib
import tempfile
from pathlib import Path
from unittest.mock import patch

from scripts import data_pipeline

from scripts.data_pipeline import (
    PROFILE_HEADER, ValidationError, csd_uid, parse_income, profile_records, unique_index,
)


class IncomeInterpretationTests(unittest.TestCase):
    def test_published_value_preserves_dollars_and_leading_flag_zeroes(self):
        value = parse_income("98000", "", "00000")
        self.assertEqual(value["median_household_income_cad"], 98000)
        self.assertEqual(value["availability_status"], "available")
        self.assertFalse(value["income_quality_caution"])

    def test_suppression_is_null_instead_of_zero(self):
        value = parse_income("", "x", "00909")
        self.assertIsNone(value["median_household_income_cad"])
        self.assertEqual(value["availability_status"], "suppressed")

    def test_long_form_suppression_does_not_suppress_short_form_income(self):
        value = parse_income("50000", "", "00009")
        self.assertEqual(value["availability_status"], "available")
        self.assertFalse(value["income_quality_caution"])

    def test_long_form_nonresponse_does_not_trigger_income_caution(self):
        self.assertFalse(parse_income("50000", "", "00050")["income_quality_caution"])

    def test_short_form_nonresponse_threshold_triggers_caution(self):
        self.assertTrue(parse_income("50000", "", "05000")["income_quality_caution"])

    def test_source_caution_and_revision_are_preserved(self):
        value = parse_income("50000", "rE", "00000")
        self.assertTrue(value["income_quality_caution"])
        self.assertIn("revised", value["income_quality_note"])

    def test_unreliable_and_not_applicable_are_distinct(self):
        self.assertEqual(parse_income("", "F", "00000")["availability_status"], "unreliable")
        self.assertEqual(parse_income("", "...", "00000")["availability_status"], "not_applicable")

    def test_unexplained_blank_and_unknown_flags_fail(self):
        for value, symbol, flag in [("", "", "00000"), ("1", "?", "00000"),
                                    ("1", "", "0000"), ("1", "", "00600")]:
            with self.subTest(value=value, symbol=symbol, flag=flag):
                with self.assertRaises(ValidationError):
                    parse_income(value, symbol, flag)

    def test_contradictory_suppression_fails(self):
        for value, symbol, flag in [("50000", "x", "00909"), ("50000", "", "00900"),
                                    ("", "", "00900")]:
            with self.subTest(value=value, symbol=symbol, flag=flag):
                with self.assertRaises(ValidationError):
                    parse_income(value, symbol, flag)

    def test_zero_is_a_published_value_not_missing(self):
        value = parse_income("0", "", "00000")
        self.assertEqual(value["median_household_income_cad"], 0)
        self.assertEqual(value["availability_status"], "available")

    def test_nonfinite_and_fractional_income_fail(self):
        for value in ["NaN", "Infinity", "123.5", "invalid"]:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                parse_income(value, "", "00000")


class GeographyAndProfileTests(unittest.TestCase):
    config = {"census_year": 2021, "income_characteristic_id": "243",
              "income_characteristic_name": "Median total income of household in 2020 ($)"}

    def income_row(self):
        row = [""] * len(PROFILE_HEADER)
        row[0:5] = ["2021", "2021S051212090985", "12090985", "Dissemination area", "12090985"]
        row[7:10] = ["00000", "243", "  " + self.config["income_characteristic_name"]]
        row[11:13] = ["98000", ""]
        # Other repeated SYMBOL columns are not the total-income symbol.
        row[14] = row[16] = row[20] = row[22] = "..."
        return row

    def test_repeated_symbol_columns_do_not_overwrite_total_income_symbol(self):
        row = self.income_row()
        records = profile_records([row], self.config)
        income = records[row[1]]["243"]
        self.assertEqual(parse_income(income[11], income[12], income[7])["availability_status"],
                         "available")

    def test_duplicate_profile_records_fail_even_if_values_match(self):
        row = self.income_row()
        with self.assertRaises(ValidationError):
            profile_records([row, row], self.config)

    def test_wrong_characteristic_label_or_year_fails(self):
        for index, value in [(9, "Median after-tax income of household in 2020 ($)"), (0, "2016")]:
            row = self.income_row()
            row[index] = value
            with self.subTest(index=index), self.assertRaises(ValidationError):
                profile_records([row], self.config)

    def test_duplicate_geography_ids_fail(self):
        with self.assertRaises(ValidationError):
            unique_index([{"uid": "12090103"}, {"uid": "12090103"}], "uid")

    def test_membership_uses_string_components_not_metropolitan_area(self):
        row = {"PRuid": "12", "CDcode": "09", "CSDcode": "034", "CMAuid": "205"}
        self.assertEqual(csd_uid(row), "1209034")
        row["CSDcode"] = "019"
        self.assertNotEqual(csd_uid(row), "1209034")


class IndependentSampleTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.raw = Path(self.folder.name)
        self.config = {"income_characteristic_id": "243", "sample_api_characteristic_id": "229",
                       "sample_api_dataflow": "STC_CP:DF_DA(1.3)",
                       "income_characteristic_name": "Median total income of household in 2020 ($)",
                       "sample_da_uids": ["12090104"]}
        row = [""] * len(PROFILE_HEADER)
        row[2], row[7], row[12] = "12090104", "00909", "x"
        self.records = {"2021S051212090104": {"243": row}}
        self.sample = {"REF_AREA": "2021S051212090104", "CHARACTERISTIC": "229", "GENDER": "1",
                       "STATISTIC": "1", "TIME_PERIOD": "2021", "OBS_VALUE": "", "FLAG": "6",
                       "DATAFLOW": "STC_CP:DF_DA(1.3)", "DATA_QUALITY_FLAG": "00909"}
        (self.raw / "sample-api-metadata.xml").write_text('''
<Root xmlns:s="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/structure"
      xmlns:c="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/common">
  <s:Codelist id="CL_CHARACTERISTIC"><s:Code id="229">
    <c:Name xml:lang="en">Median total income of household in 2020 ($)</c:Name>
  </s:Code></s:Codelist>
  <s:Codelist id="CL_FLAG"><s:Code id="6">
    <c:Name xml:lang="en">(x) suppressed for confidentiality</c:Name>
  </s:Code></s:Codelist>
</Root>''')

    def check(self):
        with (self.raw / "profile-samples.csv").open("w", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(self.sample))
            writer.writeheader()
            writer.writerow(self.sample)
        with patch.object(data_pipeline, "RAW", self.raw):
            return data_pipeline.check_samples(self.records, self.config)

    def test_distinct_api_variable_and_numeric_suppression_flag_match(self):
        result = self.check()
        self.assertTrue(result[0]["matched"])
        self.assertIsNone(result[0]["income_cad"])
        self.assertEqual(result[0]["symbol"], "x")

    def test_wrong_api_variable_is_rejected(self):
        self.sample["CHARACTERISTIC"] = "243"
        with self.assertRaises(ValidationError):
            self.check()

    def test_mismatched_published_value_is_rejected(self):
        self.sample["OBS_VALUE"] = "100000"
        with self.assertRaises(ValidationError):
            self.check()

    def test_unknown_api_flag_is_rejected(self):
        self.sample["FLAG"] = "O"
        with self.assertRaises(ValidationError):
            self.check()




class ReviewedSnapshotTests(unittest.TestCase):
    def test_restore_keeps_the_exact_reviewed_bytes(self):
        original = b'{"numViews": 522914, "lastViewed": 1791291600000}\n'
        with tempfile.TemporaryDirectory() as folder:
            snapshot = Path(folder) / "reviewed.json.gz"
            destination = Path(folder) / "raw" / "reviewed.json"
            snapshot.write_bytes(gzip.compress(original, mtime=0))
            data_pipeline.restore_reviewed_snapshot(snapshot, destination,
                                                    hashlib.sha256(original).hexdigest())
            self.assertEqual(destination.read_bytes(), original)

    def test_changed_snapshot_cannot_replace_a_previous_cache(self):
        original = b"reviewed input"
        with tempfile.TemporaryDirectory() as folder:
            snapshot = Path(folder) / "reviewed.json.gz"
            destination = Path(folder) / "reviewed.json"
            snapshot.write_bytes(gzip.compress(b"changed input", mtime=0))
            destination.write_bytes(original)
            with self.assertRaisesRegex(ValidationError, "Reviewed snapshot changed"):
                data_pipeline.restore_reviewed_snapshot(snapshot, destination,
                                                        hashlib.sha256(original).hexdigest())
            self.assertEqual(destination.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
