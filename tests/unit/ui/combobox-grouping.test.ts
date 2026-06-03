import { describe, it, expect } from "vitest";
import {
  groupComboboxOptions,
  filterComboboxOptions,
  type ComboboxOption,
} from "@/components/ui/combobox";

describe("groupComboboxOptions", () => {
  it("returns a single empty-heading bucket when no option has a group", () => {
    const options: ComboboxOption[] = [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Bravo" },
    ];
    const result = groupComboboxOptions(options);
    expect(result).toEqual([{ heading: "", options }]);
  });

  it("buckets options by group, preserving input order within each", () => {
    const options: ComboboxOption[] = [
      { value: "1", label: "Sales", group: "Income" },
      { value: "2", label: "Discount", group: "Income" },
      { value: "3", label: "Tax Payable", group: "Other Current Liability" },
      { value: "4", label: "TDS Payable", group: "Other Current Liability" },
      { value: "5", label: "Furniture", group: "Fixed Asset" },
    ];
    const result = groupComboboxOptions(options);
    expect(result).toEqual([
      {
        heading: "Income",
        options: [
          { value: "1", label: "Sales", group: "Income" },
          { value: "2", label: "Discount", group: "Income" },
        ],
      },
      {
        heading: "Other Current Liability",
        options: [
          { value: "3", label: "Tax Payable", group: "Other Current Liability" },
          { value: "4", label: "TDS Payable", group: "Other Current Liability" },
        ],
      },
      {
        heading: "Fixed Asset",
        options: [{ value: "5", label: "Furniture", group: "Fixed Asset" }],
      },
    ]);
  });

  it("preserves group order from first appearance, not alphabetical", () => {
    const options: ComboboxOption[] = [
      { value: "1", label: "Zebra", group: "Z-Group" },
      { value: "2", label: "Apple", group: "A-Group" },
    ];
    const result = groupComboboxOptions(options);
    expect(result.map((b) => b.heading)).toEqual(["Z-Group", "A-Group"]);
  });

  it("treats missing/empty group as its own bucket alongside grouped ones", () => {
    const options: ComboboxOption[] = [
      { value: "1", label: "Has group", group: "Income" },
      { value: "2", label: "No group" }, // undefined group
      { value: "3", label: "Empty group", group: "" }, // empty string
    ];
    const result = groupComboboxOptions(options);
    // Both undefined and "" land in the "" bucket
    expect(result).toEqual([
      {
        heading: "Income",
        options: [{ value: "1", label: "Has group", group: "Income" }],
      },
      {
        heading: "",
        options: [
          { value: "2", label: "No group" },
          { value: "3", label: "Empty group", group: "" },
        ],
      },
    ]);
  });

  it("returns empty array when input is empty", () => {
    expect(groupComboboxOptions([])).toEqual([{ heading: "", options: [] }]);
  });
});

describe("filterComboboxOptions", () => {
  const sample: ComboboxOption[] = [
    { value: "1", label: "Sales", hint: "4000", group: "Income" },
    { value: "2", label: "General Income", hint: "4001", group: "Income" },
    { value: "3", label: "Tax Payable", hint: "2100", group: "Other Current Liability" },
    { value: "4", label: "Furniture", hint: "1500", group: "Fixed Asset" },
  ];

  it("returns all options when search is empty", () => {
    expect(filterComboboxOptions(sample, "")).toEqual(sample);
    expect(filterComboboxOptions(sample, "   ")).toEqual(sample);
  });

  it("matches against label (case-insensitive)", () => {
    expect(filterComboboxOptions(sample, "sales")).toHaveLength(1);
    expect(filterComboboxOptions(sample, "SALES")).toHaveLength(1);
    // "income" matches: Sales (via Income group) + General Income (label + group) = 2
    expect(filterComboboxOptions(sample, "income")).toHaveLength(2);
  });

  it("matches against hint (the account code)", () => {
    expect(filterComboboxOptions(sample, "4000")).toEqual([sample[0]]);
    expect(filterComboboxOptions(sample, "21")).toEqual([sample[2]]);
  });

  it("matches against group label", () => {
    expect(filterComboboxOptions(sample, "liability").map((o) => o.value)).toEqual([
      "3",
    ]);
    expect(filterComboboxOptions(sample, "fixed")).toEqual([sample[3]]);
  });

  it("returns empty array when nothing matches", () => {
    expect(filterComboboxOptions(sample, "zzzzzz")).toEqual([]);
  });
});
