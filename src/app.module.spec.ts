import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from './app.module';
import { AppService } from './app.service';
import { FileModule } from './components/files/file.module';
import { EventManagerModule } from './components/event-manager/event-manager.module';
import { RuntimeConfigService } from './control-plane/config/runtime-config.service';
import { ScheduledJobsService } from './control-plane/jobs/scheduled-jobs.service';
import { AccountMaintenanceService } from './control-plane/maintenance/account-maintenance.service';

describe('AppModule runtime wiring', () => {
  it('registers every control-plane provider and the file module exactly once', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule) as unknown[];
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as Array<unknown>;

    expect(providers).toEqual(expect.arrayContaining([
      AppService,
      RuntimeConfigService,
      ScheduledJobsService,
      AccountMaintenanceService,
    ]));
    expect(imports).toEqual(expect.arrayContaining([
      expect.objectContaining({ module: FileModule }),
    ]));
    expect(imports.filter((entry) => entry === EventManagerModule)).toHaveLength(1);
  });
});
