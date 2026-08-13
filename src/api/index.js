import * as realClient from './client.js'
import * as mockClient from './mockClient.js'

// VITE_API_BASE_URL が未設定の間はモッククライアントにフォールバックする。
// バックエンドが立ったら .env に VITE_API_BASE_URL を設定するだけで切り替わる。
const impl = import.meta.env.VITE_API_BASE_URL ? realClient : mockClient

export const {
  fetchProjects,
  createProject,
  updateProject,
  updateProjectImage,
  removeProjectImage,
  deleteProjects,
  fetchProjectMembers,
  addProjectMembers,
  removeProjectMember,
  fetchProjectStorageStatus,
  updateProjectStorage,
  updateProjectFieldOptions,
  addProjectCustomOption,
  removeProjectCustomOption,
  fetchReports,
  fetchReport,
  fetchReportFacets,
  updateReportStatus,
  updateReportFields,
  deleteReport,
  createManualReport,
  attachReportVideo,
  fetchReportComments,
  createReportComment,
  deleteReportComment,
  loginWithGoogle,
  logout,
  me,
  updateDisplayName,
} = impl
