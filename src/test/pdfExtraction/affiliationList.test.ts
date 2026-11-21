import { describe, expect, it } from "vitest";
import { looksLikeAffiliationList } from "../../services/pdfExtraction/resolver/documentResolver";

describe("looksLikeAffiliationList", () => {
  it("accepts a back-matter list of institutions and places", () => {
    expect(looksLikeAffiliationList("Department of Neurosurgery, Maxine Dunitz Neurosurgical Institute, Cedars-Sinai Medical Center, Los Angeles, CA, USA. Department of Computational Biomedicine, Cedars-Sinai Medical Center, Los Angeles, CA, USA.")).toBe(true);
    expect(looksLikeAffiliationList("140Institute of Psychiatry, Psychology & Neuroscience, London, UK. 192Hospital Universitario la Paz, Madrid, Spain. 196CAEBI, Centro Andaluz de Estudios Bioinformáticos, Sevilla, Spain.")).toBe(true);
    expect(looksLikeAffiliationList("11RIKEN Center for Sustainable Resource Science, Yokohama, Kanagawa 230-0045, Japan")).toBe(true);
  });

  it("rejects prose that mentions an institution", () => {
    expect(looksLikeAffiliationList("Data were obtained from the European Alzheimer & Dementia Biobank consortium, which combines genetic and clinical data from 16 countries.")).toBe(false);
    expect(looksLikeAffiliationList("Regen Weber-Fares, JD, MPH, is a Research Specialist in the Population Informatics Lab of the Department of Health Policy, Texas A&M University.")).toBe(false);
    expect(looksLikeAffiliationList("Participants were recruited at the University Hospital, Bonn, between 2019 and 2021.")).toBe(false);
  });
});
