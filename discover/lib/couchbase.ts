import type { Bucket, Cluster, Collection, Scope } from "couchbase";
import { connect } from "./cb-sdk";

export type AppCollections = {
  cluster: Cluster;
  bucket: Bucket;
  eventsScope: Scope;
  events: Collection;
  users: Collection;
  sessions: Collection;
  dataViews: Collection;
  savedSearches: Collection;
};

declare global {
  // eslint-disable-next-line no-var
  var __logdemoCb: Promise<AppCollections> | undefined;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env ${name}`);
  return value;
}

async function connectCluster(): Promise<AppCollections> {
  const connstr = requireEnv("CB_CONNSTR");
  const username = requireEnv("CB_USERNAME");
  const password = requireEnv("CB_PASSWORD");
  const bucketName = process.env.CB_BUCKET || "logs";
  const eventsScopeName = process.env.CB_SCOPE || "app";
  const eventsCollectionName = process.env.CB_COLLECTION || "events";

  const cluster = await connect(connstr, {
    username,
    password,
  });

  const bucket = cluster.bucket(bucketName);
  const eventsScope = bucket.scope(eventsScopeName);
  const events = eventsScope.collection(eventsCollectionName);
  const discoverScope = bucket.scope("discover");
  const users = discoverScope.collection("users");
  const sessions = discoverScope.collection("sessions");
  const dataViews = discoverScope.collection("data_views");
  const savedSearches = discoverScope.collection("saved_searches");

  return {
    cluster,
    bucket,
    eventsScope,
    events,
    users,
    sessions,
    dataViews,
    savedSearches,
  };
}

export function getCouchbase(): Promise<AppCollections> {
  if (!globalThis.__logdemoCb) {
    globalThis.__logdemoCb = connectCluster().catch((err) => {
      globalThis.__logdemoCb = undefined;
      throw err;
    });
  }
  return globalThis.__logdemoCb;
}

export function searchIndexName(): string {
  return process.env.CB_SEARCH_INDEX || "events_fts";
}

export async function isClusterReady(): Promise<{ ok: boolean; detail?: string }> {
  try {
    const { cluster, events } = await getCouchbase();
    const ping = await cluster.ping();
    const services = Object.keys(ping?.services ?? {});
    await events.exists("__discover_healthz__");
    return { ok: true, detail: `ping ok (${services.join(",") || "no-services"})` };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("healthz couchbase check failed:", detail);
    return { ok: false, detail };
  }
}
