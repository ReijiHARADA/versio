import { describe, expect, it } from "vitest";
import { looksLikeAffiliationList, looksLikeNameList } from "../../services/pdfExtraction/resolver/documentResolver";

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

describe("looksLikeNameList", () => {
  it("accepts a consortium name list with affiliation numbers", () => {
    expect(looksLikeNameList(", Norbert Scherbaum , Jürgen Deckert , 28,29 30,31 32 , Emrah Düzel , Timo Grimmer ,")).toBe(true);
    expect(looksLikeNameList("Hilkka Soininen 67, Sami Heikkinen 68, Jakub Hort 69,70, Martin Vyhnalek 71")).toBe(true);
  });
  it("rejects acknowledgement and contribution lists", () => {
    expect(looksLikeNameList("The authors would like to thank Dr. Elena Sandalova, Dr. Jorming Goh, Zhi Meng Lim, Siew Yee Ng, Michelle Tan")).toBe(false);
    expect(looksLikeNameList("Jessica K. Lu, Weilan Wang, Yi Ern Chew, Lihuan Guan, Brian K. Kennedy, Andrea B. Maier.")).toBe(false);
  });
});
