/* Run the complete static release pipeline without an oversized platform command. */
'use strict';
const path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const pipeline=[
 'tests/core.test.js','tests/catalog.test.js','tests/interdisciplinary.test.js','tests/planning.test.js','tests/plan-export.test.js','tests/planning-ui.test.js','tests/planner-board.test.js','tests/local-lock.test.js','tests/interactions.test.js','tests/backup.test.js',
 'tests/backup-ui.test.js','tests/favorites.test.js','tests/search.test.js','tests/course-directory.test.js',
 'tests/routes.test.js','tests/portals.test.js','tests/checklist.test.js','tests/feedback.test.js','tests/feedback-admin.test.js','tests/analytics.test.js',
 'tests/build.test.js','scripts/build_site.js','tests/site.test.js'
];
for(const script of pipeline){
 const result=spawnSync(process.execPath,[script],{cwd:root,stdio:'inherit'});
 if(result.error){process.stderr.write(result.error.message+'\n');process.exit(1);}
 if(result.status!==0)process.exit(result.status||1);
}
