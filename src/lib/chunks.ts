import { geoDistance } from 'd3-geo';
import type { ChunkId } from '../../shared';

/** Rough [lon, lat] centres of the chunk regions, used only to order chunk requests by viewport distance. */
export const CHUNK_CENTROIDS: Record<ChunkId, [number, number]> = {
  'europe-west': [10, 50],
  'europe-east': [35, 54],
  'asia-west': [45, 32],
  'asia-central-south': [72, 30],
  'asia-east-southeast': [110, 25],
  'africa-north': [15, 27],
  'africa-sub': [22, -5],
  'americas-north': [-90, 25],
  'americas-south': [-60, -15],
  oceania: [150, -15],
};

/** Nearest chunk to the viewport centre first (spec 4.4 step 5). */
export function sortChunksByDistance(ids: ChunkId[], center: [number, number]): ChunkId[] {
  return [...ids].sort((a, b) => geoDistance(CHUNK_CENTROIDS[a], center) - geoDistance(CHUNK_CENTROIDS[b], center));
}
