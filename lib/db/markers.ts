import type { Marker } from "@/lib/types";
import { db } from "./index";
import { recordDeletion } from "./deletions";
import { newId, now } from "./util";

/** Fields supplied when creating a marker (id/createdAt/updatedAt generated). */
export type MarkerInput = Omit<Marker, "id" | "createdAt" | "updatedAt">;

/** Fields that may be patched on an existing marker (updatedAt is bumped). */
export type MarkerChanges = Partial<
  Omit<Marker, "id" | "createdAt" | "updatedAt">
>;

export async function createMarker(input: MarkerInput): Promise<Marker> {
  const ts = now();
  const marker: Marker = { ...input, id: newId(), createdAt: ts, updatedAt: ts };
  await db.markers.add(marker);
  return marker;
}

export function getMarker(id: string): Promise<Marker | undefined> {
  return db.markers.get(id);
}

/** All markers, ascending by `date`. */
export function getAllMarkers(): Promise<Marker[]> {
  return db.markers.orderBy("date").toArray();
}

export async function updateMarker(
  id: string,
  changes: MarkerChanges,
): Promise<void> {
  await db.markers.update(id, { ...changes, updatedAt: now() });
}

export async function deleteMarker(id: string): Promise<void> {
  await db.markers.delete(id);
  await recordDeletion("markers", id);
}
