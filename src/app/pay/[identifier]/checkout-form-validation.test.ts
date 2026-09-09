import { describe, expect, it } from "vitest";

import {
  isValidCpfFormat,
  isValidEmailFormat,
  isValidPostalCodeFormat,
  maskCpf,
  maskPostalCode,
} from "./checkout-form-validation";

describe("checkout form validation", () => {
  it("masks CPF digits progressively as 000.000.000-00, discarding non-digits and anything past 11 digits", () => {
    expect(maskCpf("1")).toBe("1");
    expect(maskCpf("123")).toBe("123");
    expect(maskCpf("1234")).toBe("123.4");
    expect(maskCpf("123456")).toBe("123.456");
    expect(maskCpf("1234567")).toBe("123.456.7");
    expect(maskCpf("123456789")).toBe("123.456.789");
    expect(maskCpf("12345678900")).toBe("123.456.789-00");
    expect(maskCpf("123.456.789-00extra999")).toBe("123.456.789-00");
  });

  it("masks the postal code as 00000-000, discarding non-digits and anything past 8 digits", () => {
    expect(maskPostalCode("1")).toBe("1");
    expect(maskPostalCode("12345")).toBe("12345");
    expect(maskPostalCode("123456")).toBe("12345-6");
    expect(maskPostalCode("12345678")).toBe("12345-678");
    expect(maskPostalCode("12345-678999")).toBe("12345-678");
  });

  it("accepts a plausible email shape and rejects the obvious malformed ones", () => {
    expect(isValidEmailFormat("buyer@example.com")).toBe(true);
    expect(isValidEmailFormat("  buyer@example.com  ")).toBe(true);
    expect(isValidEmailFormat("buyer@")).toBe(false);
    expect(isValidEmailFormat("buyer example.com")).toBe(false);
    expect(isValidEmailFormat("buyer@example")).toBe(false);
    expect(isValidEmailFormat("")).toBe(false);
  });

  it("validates the CPF check digits with the same algorithm the server applies, in either grammar", () => {
    expect(isValidCpfFormat("111.444.777-35")).toBe(true);
    expect(isValidCpfFormat("11144477735")).toBe(true);
    expect(isValidCpfFormat("111.444.777-36")).toBe(false);
    expect(isValidCpfFormat("111.111.111-11")).toBe(false);
    expect(isValidCpfFormat("123")).toBe(false);
  });

  it("validates the postal code in both the masked and digits-only grammar", () => {
    expect(isValidPostalCodeFormat("12345-678")).toBe(true);
    expect(isValidPostalCodeFormat("12345678")).toBe(true);
    expect(isValidPostalCodeFormat("1234-567")).toBe(false);
    expect(isValidPostalCodeFormat("abcde-678")).toBe(false);
  });
});
