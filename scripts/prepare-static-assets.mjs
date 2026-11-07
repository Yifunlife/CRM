import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {retainStaticAssets} from './retain-static-assets.mjs';

const repository=execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{encoding:'utf8'}).trim();
console.log('Static assets for current and recent open pages:',retainStaticAssets('dist/client',join(repository,'crm-static-history')));
