import { NetlifyIntegration } from "@netlify/sdk";
import { JSONPath } from "jsonpath-plus";
import { Facet } from "./createFacets";
import { ManifestEntry } from ".";

export class Document {
  //Return indexing data from a page's JSON-formatted AST for search purposes
  tree: any;
  robots: any;
  keywords: any;
  description: any;
  paragraphs: string;
  code: { lang: string; value: any }[];
  title: any;
  headings: any;
  slug: string;
  preview: string;
  facets: any;
  noIndex: any;
  reasons: any;

  constructor(doc: any) {
    this.tree = doc;

    console.log("called doc constructor");
    //find metadata
    [this.robots, this.keywords, this.description] = this.findMetadata();
    //find paragraphs
    this.paragraphs = this.findParagraphs();
    //find code
    this.code = this.findCode();

    //find title, headings
    [this.title, this.headings] = this.findHeadings();

    //derive slug
    this.slug = this.deriveSlug();

    //derive preview
    this.preview = this.derivePreview();

    //derive facets
    this.facets = deriveFacets(this.tree);

    //noindex, reasons
    [this.noIndex, this.reasons] = this.getNoIndex();
  }

  findMetadata() {
    console.log("Finding metadata");
    let robots: Boolean = true; //can be set in the rst if the page is supposed to be crawled
    let keywords: string[] | null = null; //keywords is an optional list of strings
    let description: string | null = null; //this can be optional??

    let results = JSONPath({
      path: "$..children[?(@.name=='meta')]..options",
      json: this.tree,
    });
    // console.log("\n\r metadata results:", results);
    if (results.length) {
      if (results.length > 1)
        console.log(
          "length of results is greater than one, it's: " + results.length
        );
      const val = results[0];
      //check if robots, set to false if no robots
      if ("robots" in val && (val.robots == "None" || val.robots == "noindex"))
        robots = false;

      keywords = val?.keywords ?? null;
      description = val?.description ?? null;
      console.log(
        `robots: ${robots}, keywords: ${keywords}, description: ${description}`
      );
    }

    return [robots, keywords, description];
  }

  findParagraphs() {
    console.log("Finding paragraphs");
    let paragraphs = "";

    let results = JSONPath({
      path: "$..children[?(@.type=='paragraph')]..value",
      json: this.tree,
    });

    // console.log("\n\r paragraph results:", results);
    for (let r of results) {
      paragraphs += r;
    }
    return paragraphs;
  }

  findCode() {
    console.log("finding code");

    let results = JSONPath({
      path: "$..children[?(@.type=='code')]",
      json: this.tree,
    });

    // console.log("\n\r code results:", results);

    let codeContents = [];
    for (let r of results) {
      const lang = r.lang ?? null;
      //check value on this
      codeContents.push({ lang: lang, value: r.value });
    }
    // console.log(`codeContents: ${codeContents}`);
    return codeContents;
  }

  findHeadings() {
    console.log("Finding headings and title");
    let headings: string[] = [];
    let title: string | null = null;
    // Get the children of headings nodes

    let results = JSONPath({
      path: "$..children[?(@.type=='heading')].children",
      json: this.tree,
    });

    // console.log(`\n\r headings results: ${results.length}, ${results}`);

    //no heading nodes found?? page doesn't have title, or headings
    if (!results.length) return [title, headings];

    for (let r of results) {
      let heading = [];
      const parts = JSONPath({
        path: "$..value",
        json: r,
      });
      // console.log(
      //   `\n\r parts results for heading: ${JSON.stringify(r)}, value: ${parts}`
      // );

      //add a check in case there is no parts found

      for (let part of parts) {
        // add a check in case there is no value field found
        heading.push(part);
      }
      headings.push(heading.join());
    }

    title = headings.shift() ?? null;
    return [title, headings];
  }

  deriveSlug() {
    console.log("Deriving slug");

    let pageId = this.tree["filename"]?.split(".")[0];
    if (pageId == "index") pageId = "";
    return pageId;
  }

  derivePreview() {
    console.log("Deriving document search preview");
    //set preview to the meta description if one is specified

    if (this.description) return this.description;

    // Set preview to the paragraph value that's a child of a 'target' element
    // (for reference pages that lead with a target definition)

    let results = JSONPath({
      path: "$..children[?(@.type=='target')].children[?(@.type=='paragraph')]",
      json: this.tree,
    });

    if (!results.length) {
      //  Otherwise attempt to set preview to the first content paragraph on the page,
      //   excluding admonitions.
      results = JSONPath({
        path: "$..children[?(@.type=='section')].children[?(@.type=='paragraph')]",
        json: this.tree,
      });
    }

    if (results.length) {
      let strList = [];

      //get value in results
      const first = JSONPath({
        path: "$..value",
        json: results[0],
      });

      //TO DO: check value on this
      for (let f of first) {
        strList.push(f.value);
      }
      return strList.join();
    }

    //else, give up and don't provide a preview
    return "";
  }

  getNoIndex() {
    //TO DO determine what the index/no index rules should be
    console.log("Determining indexability");

    let noIndex = false;
    let reasons: string[] = [];

    //if :robots: None in metadata, do not index
    if (!this.robots) {
      noIndex = true;
      reasons.push("robots=None or robots=noindex in meta directive");
    }

    if (!this.title) {
      noIndex = true;
      reasons.push("This page has no headings");
    }

    console.log(`NoIndex: ${noIndex} because of ${JSON.stringify(reasons)}`);
    return [noIndex, reasons];
  }

  exportAsManifest = () => {
    // Generate the manifest dictionary entry from the AST source

    if (this.noIndex) {
      console.info("Refusing to index");
      return null;
    }

    const document = new ManifestEntry({
      slug: this.slug,
      title: this.title,
      headings: this.headings,
      paragraphs: this.paragraphs,
      code: this.code,
      preview: this.preview,
      keywords: this.keywords,
      facets: this.facets,
    });

    return document;
  };
}

const deriveFacets = (tree: any) => {
  //Format facets for ManifestEntry from bson entry tree['facets'] if it exists

  const insertKeyVals = (facet: any, prefix = "") => {
    const key = prefix + facet.category;
    //TODO: check this logic
    documentFacets[key] = documentFacets[key] ?? [];
    documentFacets[key].push(facet.value);

    if (!facet.subFacets) return;

    for (let subFacet of facet.subFacets) {
      insertKeyVals(subFacet, key + ">" + facet.value + ">");
    }
  };

  const createFacet = (facetEntry: any) => {
    const facet = new Facet(
      facetEntry.category,
      facetEntry.value,
      facetEntry.sub_facets
    );
    insertKeyVals(facet);
  };

  let documentFacets: any = {};
  if (tree["facets"]) {
    for (let facetEntry of tree["facets"]) {
      createFacet(facetEntry);
    }
  }
  console.log("Document facets:" + JSON.stringify(documentFacets));
  return documentFacets;
};
