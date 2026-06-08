<script setup>
import { onMounted, reactive, ref } from 'vue'
import { authApi } from '../api/invoices'
import { currentAdmin, isOwner } from '../auth/session'

const error = ref('')
const success = ref('')
const changingPassword = ref(false)
const loadingAdmins = ref(false)
const creatingAdmin = ref(false)
const admins = ref([])
const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})
const adminForm = reactive({
  username: '',
  displayName: '',
  password: '',
  role: 'admin',
})

const showMessage = (message) => {
  success.value = message
  error.value = ''
  window.setTimeout(() => {
    success.value = ''
  }, 4000)
}

const changePassword = async () => {
  error.value = ''
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    error.value = 'New passwords do not match'
    return
  }
  changingPassword.value = true
  try {
    await authApi.changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    })
    Object.assign(passwordForm, {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    })
    showMessage('Password changed successfully')
  } catch (requestError) {
    error.value = requestError.response?.data?.message || 'Unable to change password'
  } finally {
    changingPassword.value = false
  }
}

const loadAdmins = async () => {
  if (!isOwner.value) return
  loadingAdmins.value = true
  try {
    admins.value = (await authApi.listAdmins()).data
  } catch (requestError) {
    error.value = requestError.response?.data?.message || 'Unable to load admins'
  } finally {
    loadingAdmins.value = false
  }
}

const createAdmin = async () => {
  creatingAdmin.value = true
  error.value = ''
  try {
    await authApi.createAdmin(adminForm)
    Object.assign(adminForm, {
      username: '',
      displayName: '',
      password: '',
      role: 'admin',
    })
    showMessage('Admin account created')
    await loadAdmins()
  } catch (requestError) {
    error.value = requestError.response?.data?.message || 'Unable to create admin'
  } finally {
    creatingAdmin.value = false
  }
}

const updateAdmin = async (admin, payload) => {
  error.value = ''
  try {
    await authApi.updateAdmin(admin._id || admin.id, payload)
    showMessage('Admin updated')
    await loadAdmins()
  } catch (requestError) {
    error.value = requestError.response?.data?.message || 'Unable to update admin'
  }
}

const resetAdminPassword = async (admin) => {
  const password = window.prompt(
    `New password for ${admin.username} (minimum 10 characters):`,
  )
  if (!password) return
  await updateAdmin(admin, { password })
}

onMounted(loadAdmins)
</script>

<template>
  <section class="container page-section">
    <div class="page-heading">
      <div>
        <span class="eyebrow">ACCOUNT SECURITY</span>
        <h1>Account & Admins</h1>
        <p>ប្ដូរ password និងកំណត់សិទ្ធិអ្នកប្រើប្រាស់។</p>
      </div>
      <span class="role-badge">{{ currentAdmin?.role }}</span>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <div v-if="success" class="alert alert-success">{{ success }}</div>

    <div class="content-card form-card mb-4">
      <div class="section-title">
        <span class="section-number"><i class="bi bi-key"></i></span>
        <div><h2>Change Password</h2><p>ប្រើ password យ៉ាងតិច 10 តួអក្សរ។</p></div>
      </div>
      <form class="row g-3" @submit.prevent="changePassword">
        <div class="col-md-4">
          <label class="form-label">Current Password</label>
          <input v-model="passwordForm.currentPassword" class="form-control" type="password" autocomplete="current-password" required />
        </div>
        <div class="col-md-4">
          <label class="form-label">New Password</label>
          <input v-model="passwordForm.newPassword" class="form-control" type="password" minlength="10" autocomplete="new-password" required />
        </div>
        <div class="col-md-4">
          <label class="form-label">Confirm Password</label>
          <input v-model="passwordForm.confirmPassword" class="form-control" type="password" minlength="10" autocomplete="new-password" required />
        </div>
        <div class="col-12">
          <button class="btn btn-danger" type="submit" :disabled="changingPassword">
            {{ changingPassword ? 'កំពុងប្ដូរ...' : 'ប្ដូរ Password' }}
          </button>
        </div>
      </form>
    </div>

    <template v-if="isOwner">
      <div class="content-card form-card mb-4">
        <div class="section-title">
          <span class="section-number"><i class="bi bi-person-plus"></i></span>
          <div><h2>បង្កើត Admin</h2><p>Owner គ្រប់គ្រងបានទាំងអស់, Admin គ្រប់គ្រងការលក់, Viewer មើលតែប៉ុណ្ណោះ។</p></div>
        </div>
        <form class="row g-3" @submit.prevent="createAdmin">
          <div class="col-md-3">
            <label class="form-label">Username *</label>
            <input v-model.trim="adminForm.username" class="form-control" required />
          </div>
          <div class="col-md-3">
            <label class="form-label">Display Name</label>
            <input v-model.trim="adminForm.displayName" class="form-control" />
          </div>
          <div class="col-md-3">
            <label class="form-label">Password *</label>
            <input v-model="adminForm.password" class="form-control" type="password" minlength="10" required />
          </div>
          <div class="col-md-3">
            <label class="form-label">Role</label>
            <select v-model="adminForm.role" class="form-select">
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          <div class="col-12">
            <button class="btn btn-danger" type="submit" :disabled="creatingAdmin">
              {{ creatingAdmin ? 'កំពុងបង្កើត...' : 'បង្កើត Admin' }}
            </button>
          </div>
        </form>
      </div>

      <div class="content-card">
        <div class="card-toolbar"><h2 class="panel-title mb-0">Admin Accounts</h2></div>
        <div v-if="loadingAdmins" class="loading-state"><div class="spinner-border text-danger"></div></div>
        <div v-else class="table-responsive">
          <table class="table invoice-table mb-0">
            <thead><tr><th>Admin</th><th>Role</th><th>Status</th><th>Last Login</th><th class="text-end">Actions</th></tr></thead>
            <tbody>
              <tr v-for="admin in admins" :key="admin._id || admin.id">
                <td><strong>{{ admin.displayName || admin.username }}</strong><small class="d-block text-secondary">{{ admin.username }}</small></td>
                <td>
                  <select
                    class="form-select form-select-sm role-select"
                    :value="admin.role"
                    :disabled="String(admin._id || admin.id) === String(currentAdmin?.id)"
                    @change="updateAdmin(admin, { role: $event.target.value })"
                  >
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </td>
                <td><span class="status-pill" :class="admin.active ? 'status-paid' : 'status-cancelled'">{{ admin.active ? 'Active' : 'Disabled' }}</span></td>
                <td>{{ admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString() : '-' }}</td>
                <td class="text-end text-nowrap">
                  <button class="btn btn-sm btn-outline-secondary me-1" type="button" @click="resetAdminPassword(admin)">Reset Password</button>
                  <button
                    v-if="String(admin._id || admin.id) !== String(currentAdmin?.id)"
                    class="btn btn-sm"
                    :class="admin.active ? 'btn-outline-danger' : 'btn-outline-success'"
                    type="button"
                    @click="updateAdmin(admin, { active: !admin.active })"
                  >
                    {{ admin.active ? 'Disable' : 'Enable' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>
