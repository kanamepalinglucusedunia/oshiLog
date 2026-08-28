import { Directory, File, Paths } from 'expo-file-system';
import type { SqliteLike } from '@/db/types';
import { exportDataManifest, sealManifest } from '@/services/backup';
import { uuid } from '@/utils/id';
import { buildDataArtifact, createStagingManager } from './staging';
import type { DataStagingService } from './dataBackupOrchestrator';

export function createInstalledDataStagingService(
  db: SqliteLike,
  deviceLabel: () => string,
): DataStagingService {
  const directory = new Directory(Paths.cache, 'oshilog', 'drive-staging');
  const ensureDirectory = () => {
    if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  };
  const manager = createStagingManager({
    directory: directory.uri,
    createId: uuid,
    files: {
      async write(path, content) {
        ensureDirectory();
        const file = new File(path);
        file.create({ intermediates: true, overwrite: true });
        file.write(content);
      },
      async remove(path) {
        const file = new File(path);
        if (file.exists) file.delete();
      },
    },
  });
  return {
    async prepare() {
      const manifest = await sealManifest(exportDataManifest(db, deviceLabel()));
      return manager.stageData(await buildDataArtifact(manifest));
    },
    release(path) {
      return manager.release(path);
    },
  };
}
