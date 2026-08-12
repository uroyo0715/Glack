// managedプラン（Glank共有のTurso/R2）を使えるかどうかのフラグを手動で切り替えるスクリプト。
// 決済機能がまだ無いため、今のところ運営が手動でここを叩いて有効化する想定。
//
// 使い方: node server/scripts/set-managed-allowed.mjs <projectId> <true|false>
import { setProjectManagedAllowed } from '../src/data.js'

const [, , projectIdArg, allowedArg] = process.argv

if (!projectIdArg || !['true', 'false'].includes(allowedArg)) {
  console.error('使い方: node server/scripts/set-managed-allowed.mjs <projectId> <true|false>')
  process.exit(1)
}

const project = await setProjectManagedAllowed(Number(projectIdArg), allowedArg === 'true')
if (!project) {
  console.error(`projectId ${projectIdArg} が見つかりません`)
  process.exit(1)
}
console.log(`プロジェクト ${project.id}（${project.name}）の isManagedAllowed を ${project.isManagedAllowed} にしました`)
