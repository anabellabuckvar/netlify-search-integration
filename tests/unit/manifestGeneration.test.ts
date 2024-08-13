// Service that holds responsibility for initializing and exposing mdb interfaces.
// Also exports helper functions for common operations (insert, upsert one by _id, etc.)
// When adding helpers here, ask yourself if the helper will be used by more than one service
// If no, the helper should be implemented in that service, not here

import { Db } from "mongodb";
import * as mongodb from "mongodb";

// We should only ever have one client active at a time.
// const atlasURL = `mongodb+srv://${process.env.MONGO_ATLAS_USERNAME}:${process.env.MONGO_ATLAS_PASSWORD}@${process.env.MONGO_SEARCH_ATLAS_HOST}/?retryWrites=true&w=majority&appName=Search`;
const atlasURL = `mongodb+srv://anabella:${process.env.AB_PWD}@clustr.ylwlz.mongodb.net/?retryWrites=true&w=majority&appName=Search`;
let client = new mongodb.MongoClient(atlasURL);
console.log("initiating db");
