import {
  registerGoogleDriveAuthSpikeTask,
  triggerGoogleDriveAuthSpikeTaskForTesting,
} from './backgroundTask';
import { listAppDataFolderForSpike } from './driveProbe';
import { appendAuthSpikeEvidence } from './evidenceStore';
import { createInstalledNitroGoogleDriveAuthSpike } from './installedNitroAdapter';
import { createGoogleDriveAuthSpikeController } from './spikeController';

export async function createInstalledGoogleDriveAuthSpikeController() {
  return createGoogleDriveAuthSpikeController({
    auth: await createInstalledNitroGoogleDriveAuthSpike(),
    listAppDataFolder: listAppDataFolderForSpike,
    recordEvidence: appendAuthSpikeEvidence,
    registerBackgroundProbe: registerGoogleDriveAuthSpikeTask,
    triggerBackgroundProbe: triggerGoogleDriveAuthSpikeTaskForTesting,
    now: () => new Date().toISOString(),
  });
}
