import { Db } from "mongodb";
import crypto from "crypto";
import { Manifest } from "./manifest";
import { db } from "./searchConnector";
import assert from "assert";
import { RefreshInfo, DatabaseDocument } from "./types";

// const atlasURL = `mongodb+srv://${process.env.MONGO_ATLAS_USERNAME}:${process.env.MONGO_ATLAS_PASSWORD}@${process.env.MONGO_SEARCH_ATLAS_HOST}/?retryWrites=true&w=majority&appName=Search`;
const ATLAS_SEARCH_URI = `mongodb+srv://anabella:${process.env.AB_PWD}@${process.env.MONGO_ATLAS_SEARCH_HOST}/?retryWrites=true&w=majority&appName=Search`;
const ATLAS_CLUSTER0_URI = `mongodb+srv://anabella:${process.env.AB_PWD}@${process.env.MONGO_ATLAS_HOST}/?retryWrites=true&w=majority`;
const SNOOTY_DB_NAME = "pool_test";
const SEARCH_DB_NAME = "search-test-ab";

export interface Branch {
  branchName: string;
  active: boolean;
  urlSlug?: string | undefined;
  search: string;
  project: string;
  prodDeployable: boolean;
}

function generateHash(data: string): Promise<string> {
  const hash = crypto.createHash("sha256");

  return new Promise((resolve, reject) => {
    hash.on("readable", () => {
      const data = hash.read();
      if (data) {
        resolve(data.toString("hex"));
      }
    });

    hash.write(data);
    hash.end();
  });
}

export function joinUrl(base: string, path: string): string {
  return base.replace(/\/*$/, "/") + path.replace(/^\/*/, "");
}

const composeUpserts = async (
  manifest: Manifest,
  searchProperty: string,
  lastModified: Date,
  hash: string
) => {
  const documents = manifest.documents;
  return documents.map((document) => {
    assert.strictEqual(typeof document.slug, "string");
    // DOP-3545 and DOP-3585
    // slug is possible to be empty string ''
    assert.ok(document.slug || document.slug === "");

    // DOP-3962
    // We need a slug field with no special chars for keyword search
    // and exact match, e.g. no "( ) { } [ ] ^ “ ~ * ? : \ /" present
    document.strippedSlug = document.slug.replaceAll("/", "");

    //don't need to sort facets first??
    // if (document.facets) {
    //   document.facets = sortFacetsObject(document.facets, trieFacets);
    // }

    const newDocument: DatabaseDocument = {
      ...document,
      lastModified: lastModified,
      url: joinUrl(manifest.url, document.slug),
      manifestRevisionId: hash,
      searchProperty: [searchProperty],
      includeInGlobalSearch: manifest.global,
    };

    return {
      updateOne: {
        filter: {
          searchProperty: newDocument.searchProperty,
          slug: newDocument.slug,
        },
        update: { $set: newDocument },
        upsert: true,
      },
    };
  });
};

const deleteStaleDocuments = async (
  searchProperty: string,
  manifestRevisionId: string
) => {
  console.debug(`Removing old documents`);
  return {
    deleteMany: {
      filter: {
        searchProperty: searchProperty,
        manifestRevisionId: { $ne: manifestRevisionId },
      },
    },
  };
  //   const deleteResult = await collection.deleteMany(
  //     {
  //       searchProperty: searchProperty,
  //       manifestRevisionId: { $ne: manifestRevisionId },
  //     },
  //     { session }
  //   );
  //   status.deleted +=
  //     deleteResult.deletedCount === undefined ? 0 : deleteResult.deletedCount;
  //   console.debug(
  //     `Removed ${deleteResult.deletedCount} entries from ${collection.collectionName}`
  //   );
};

const getProperties = async (name: string, branch: string) => {
  let dbSession: Db;
  let repos_branches;
  let docsets;
  let url: string;
  let searchProperty: string;
  let repo: any;
  let docsetRepo: any;

  try {
    dbSession = await db(ATLAS_CLUSTER0_URI, SNOOTY_DB_NAME);
    repos_branches = dbSession.collection<DatabaseDocument>("repos_branches");
    docsets = dbSession.collection<DatabaseDocument>("docsets");
  } catch (e) {
    console.log("issue starting session for Snooty Pool Database", e);
  }

  const query = {
    repoName: name,
  };
  const projection = {
    projection: { project: 1, search: 1, prodDeployable: 1 },
  };

  //do we want to check if branch is inactive/delete manifest for an inactive branch if so?
  try {
    repo = await repos_branches?.find(query).toArray();
  } catch (e) {
    console.error(`Error while getting repos_branches entry in Atlas: ${e}`);
    throw e;
  }

  if (!repo.length || !repo[0].prodDeployable) {
    return ["", ""];
  } else {
    const project = repo[0].project;
    searchProperty = repo[0].search.categoryTitle;
    try {
      const docsetsQuery = { project: { $eq: project } };
      docsetRepo = await docsets?.find(docsetsQuery).toArray();
      if (docsetRepo.length) {
        url = docsetRepo[0].url.dotcomprd + docsetRepo[0].prefix.dotcomprd;
      } else {
        return ["", ""];
      }
    } catch (e) {
      console.error(`Error while getting docsets entry in Atlas ${e}`);
      throw e;
    }
  }
  //check that repos exists, only one repo
  //make sure repo is proddeployable, search field exists, and branch is active
  //if any of this is not true add operations with deletestaledocuments and deletestaleproperties
  return [searchProperty, url];
};

export const uploadManifest = async (
  manifest: Manifest,
  repoName: string,
  branch: string
) => {
  //check that manifest documents exist
  if (manifest.documents.length == 0) {
    return;
  }

  const [searchProperty, url] = await getProperties(repoName, branch);
  manifest.url = url;

  //start a session
  let documents;
  try {
    const dbSession = await db(ATLAS_SEARCH_URI, SEARCH_DB_NAME);
    documents = dbSession.collection<DatabaseDocument>("documents");
  } catch (e) {
    console.log("issue starting session for Search Database", e);
  }
  const status: RefreshInfo = {
    deleted: 0,
    upserted: 0,
    errors: false,
    dateStarted: new Date(),
    dateFinished: null,
    elapsedMS: null,
  };

  //get URL, pathname from url

  // get manifests, analogous to getManifestFromDirectory

  const hash = await generateHash(manifest.toString());
  const lastModified = new Date();

  const upserts = await composeUpserts(
    manifest,
    searchProperty,
    lastModified,
    hash
  );

  //delete stale documents
  //TODO: how do we want to delete stale properties?
  // const deletions = await deleteStaleDocuments(searchProperty, hash);
  const operations = [...upserts];
  //   await deleteStaleDocuments(manifest.documents, dbSession, status);
  //   await deleteStaleDocuments(unindexable, dbSession, status);

  //make sure url of manifest doesn't have excess leading slashes(as done in getManifests)

  //check property types
  console.info(`Starting transaction`);
  //   assert.strictEqual(typeof manifestMeta.searchProperty, "string");
  //   assert.ok(manifestMeta.searchProperty);
  //   assert.strictEqual(typeof manifestMeta.manifestRevisionId, "string");
  //   assert.ok(manifestMeta.manifestRevisionId);

  if (operations.length > 0) {
    const bulkWriteStatus = await documents?.bulkWrite(operations, {
      ordered: false,
    });
    status.deleted += bulkWriteStatus?.deletedCount ?? 0;
    status.upserted += bulkWriteStatus?.upsertedCount ?? 0;
  }
};
