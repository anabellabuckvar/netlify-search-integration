import { describe, expect, test, it, vi, beforeAll } from "vitest";
import { generateManifest } from "../../src";
import nodeManifest from "../resources/s3Manifests/node-current.json";
import * as fs from "fs";
import { Manifest } from "../../src/manifest";
import { ManifestEntry } from "../../src/manifestEntry";

let nodeManifestDocs: any = {};
let manifest: Manifest;
let manifestTitle: string;
let equivDoc: ManifestEntry;

// module.exports = fs;
// vi.mock("node:fs");
// vi.mock("node:fs/promises");

beforeAll(async () => {
  //generate a mapping of the existing manifest's documents
  for (let document of nodeManifest.documents) {
    nodeManifestDocs[document.title] = document;
  }

  //generate new manifest
  process.chdir("./documents");
  manifest = await generateManifest();

  manifestTitle = manifest?.documents[0]?.title ?? "";
  equivDoc = nodeManifestDocs["Aggregation Tutorials"];
});

//start process and run command to open zip file in documents folder
describe("Generate manifests from ast", () => {
  it("has generated the manifest", async () => {
    expect(manifest).toBeTruthy();
  });

  it("has the correct document length", () => {
    expect(manifest.documents).toHaveLength(nodeManifest.documents.length);
  });

  it("has the correct includeInGlobalSearch value"),
    () => {
      expect(manifest.global).toEqual(nodeManifest.includeInGlobalSearch);
    };
});

describe("has the correct document properties", () => {
  it("is of type string", () => {
    expect(manifestTitle).toBeTypeOf("string");
  });

  it("matches the slug", () => {
    //slug
    expect(manifest.documents[0].slug).toEqual(equivDoc.slug);
  });

  it("matches the heading", () => {
    //headings
    expect(manifest.documents[0].headings).toEqual(equivDoc.headings);
  });

  it("matches the paragraphs", () => {
    //paragraphs (FAILS ON WHITESPACE)
    expect(manifest.documents[0].paragraphs).toEqual(equivDoc.paragraphs);
  });

  it("matches the code", () => {
    //code
    expect(manifest.documents[0].code).toEqual(equivDoc.code);
  });
  //preview FAILS
  it("matches preview", () => {
    expect(manifest.documents[0].preview).toEqual(equivDoc.preview);
  });

  //tags FAILS
  it("matches tags", () => {
    expect(manifest.documents[0].tags).toEqual(equivDoc.tags);
  });

  //facets
  it("matches facets", () => {
    expect(manifest.documents[0].facets).toEqual(equivDoc.facets);
  });
});

//test Document creation
describe("given a decoded document generate all of the correct properties", () => {
  //declare decoded documents here
  it("should return the proper metadata", () => {});

  it("should return the proper paragraphs", () => {});
  it("should return the proper headings and titles", () => {});
  it("should return the proper slug", () => {});
  it("should return the proper preview", () => {});
  it("should return the proper facets", () => {});
  it("should correctly return whether the document is indexable", () => {});
});

//check export manifest function
