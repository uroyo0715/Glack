import { app } from './app.js'
import { startBackupSchedule } from './backup.js'

const PORT = process.env.PORT || 8787

startBackupSchedule()

app.listen(PORT, () => {
  console.log(`Glank API server listening on http://localhost:${PORT}/api/v1`)
})
