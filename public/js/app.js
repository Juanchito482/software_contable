const App = {
  currentPage: 'dashboard',
  modalInstance: null,
  confirmModalInstance: null,
  socket: null,
  refreshTimer: null,

  init() {
    this.modalInstance = new bootstrap.Modal(document.getElementById('formModal'));
    this.confirmModalInstance = new bootstrap.Modal(document.getElementById('confirmModal'));
    document.querySelectorAll('.nav-menu a, #mobileBottomNav a').forEach(a => {
      a.addEventListener('click', () => this.navigate(a.dataset.page));
    });
    this.connectSocket();
    this.navigate('dashboard');
  },

  connectSocket() {
    if (this.socket && this.socket.connected) return;
    this.socket = io(window.location.origin, { reconnection: true, reconnectionDelay: 1000 });
    this.socket.on('connect', () => {
      const user = Auth.user;
      if (user) this.socket.emit('auth:join', { username: user.username, role: user.role });
      document.getElementById('socketStatus').textContent = '● En vivo';
      document.getElementById('socketStatus').style.color = '#4caf50';
    });
    this.socket.on('disconnect', () => {
      document.getElementById('socketStatus').textContent = '○ Desconectado';
      document.getElementById('socketStatus').style.color = '#f44336';
    });
    this.socket.on('entity:changed', (data) => {
      const type = data.type;
      if (this.currentPage === 'dashboard') {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => this.navigate('dashboard'), 500);
        return;
      }
      const pageMap = { students: 'students', payments: 'payments', expenses: 'expenses' };
      if (this.currentPage === pageMap[type]) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => this.refreshCurrent(), 500);
      } else if (this.currentPage === 'reports' && (type === 'payments' || type === 'expenses')) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => this.refreshCurrent(), 500);
      }
    });
    this.socket.on('users:count', (count) => {
      const el = document.getElementById('onlineUsers');
      if (el) el.textContent = count + ' online';
    });
  },

  refreshCurrent() {
    const container = document.getElementById('pageContent');
    switch (this.currentPage) {
      case 'students': Students.render(container); break;
      case 'payments': Payments.render(container); break;
      case 'expenses': Expenses.render(container); break;
      case 'reports': Reports.render(container); break;
    }
  },

  destroy() {
    if (this.socket) this.socket.disconnect();
    this.currentPage = 'dashboard';
  },

  navigate(page) {
    this.currentPage = page;
    document.querySelectorAll('.nav-menu a, #mobileBottomNav a').forEach(a => {
      a.classList.toggle('active', a.dataset.page === page);
    });
    if (window.innerWidth <= 768) {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebarOverlay').classList.remove('sidebar-overlay-active');
      document.body.classList.remove('mobile-nav-open');
    }
    const container = document.getElementById('pageContent');
    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-success" role="status"></div></div>';
    switch (page) {
      case 'dashboard': Students.renderDashboard(container); break;
      case 'students': Students.render(container); break;
      case 'payments': Payments.render(container); break;
      case 'expenses': Expenses.render(container); break;
      case 'reports': Reports.render(container); break;
      case 'audit': App.renderAudit(container); break;
      case 'users': App.renderUsers(container); break;
    }
  },

  openModal(title, bodyHtml, saveCallback) {
    document.getElementById('formModalTitle').textContent = title;
    document.getElementById('formModalBody').innerHTML = bodyHtml;
    document.getElementById('formModalSave').onclick = saveCallback;
    this.modalInstance.show();
  },

  closeModal() {
    this.modalInstance.hide();
  },

  confirm(message, callback) {
    document.getElementById('confirmModalBody').textContent = message;
    document.getElementById('confirmModalBtn').onclick = () => {
      this.confirmModalInstance.hide();
      callback();
    };
    this.confirmModalInstance.show();
  },

  toast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const icons = { success: 'bi-check-circle', error: 'bi-x-circle', info: 'bi-info-circle' };
    const div = document.createElement('div');
    div.className = 'toast ' + type;
    div.innerHTML = '<i class="bi ' + (icons[type] || icons.info) + '"></i> ' + message;
    container.appendChild(div);
    setTimeout(() => { div.style.opacity = '0'; div.style.transition = 'opacity 0.3s'; setTimeout(() => div.remove(), 300); }, 3000);
  },

  formatCurrency(n) {
    return '$' + Number(n).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  },

  formatDate(d) {
    if (!d) return '';
    const date = new Date(d + (d.includes('T') ? '' : 'T00:00:00'));
    return date.toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' });
  },

  renderAudit(container) {
    container.innerHTML = `
      <div class="page-header"><h2>Auditoría</h2></div>
      <div class="card">
        <div class="card-body">
          <div class="table-container">
            <table class="table table-hover" id="auditTable">
              <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Tipo</th><th>Detalles</th></tr></thead>
              <tbody id="auditBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    API.getAudit('?limit=200').then(r => {
      const tbody = document.getElementById('auditBody');
      if (r.logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No hay registros</td></tr>';
        return;
      }
      r.logs.forEach(log => {
        const actionMap = { crear: 'Creó', editar: 'Editó', eliminar: 'Eliminó' };
        const typeMap = { estudiante: 'Estudiante', pago: 'Pago', gasto: 'Gasto', usuario: 'Usuario' };
        tbody.innerHTML += `<tr>
          <td>${App.formatDate(log.created_at)}</td>
          <td>${log.username}</td>
          <td><span class="badge bg-${log.action === 'eliminar' ? 'danger' : log.action === 'crear' ? 'success' : 'info'}">${actionMap[log.action] || log.action}</span></td>
          <td>${typeMap[log.entity_type] || log.entity_type}</td>
          <td style="font-size:12px;color:#666;">${log.details || ''}</td>
        </tr>`;
      });
    }).catch(e => App.toast(e.message, 'error'));
  },

  renderUsers(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2>Usuarios</h2>
        <button class="btn btn-primary" onclick="App.showAddUser()"><i class="bi bi-plus-lg"></i> Nuevo Usuario</button>
      </div>
      <div class="card">
        <div class="card-body">
          <div class="table-container">
            <table class="table table-hover">
              <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Creado</th></tr></thead>
              <tbody id="usersBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    API.getUsers().then(users => {
      const tbody = document.getElementById('usersBody');
      const roleMap = { admin: 'Administrador', contador: 'Contador', auxiliar: 'Auxiliar' };
      users.forEach(u => {
        tbody.innerHTML += `<tr>
          <td><strong>${u.username}</strong></td>
          <td>${u.full_name}</td>
          <td><span class="badge bg-${u.role === 'admin' ? 'danger' : u.role === 'contador' ? 'primary' : 'secondary'}">${roleMap[u.role]}</span></td>
          <td><span class="badge bg-${u.active ? 'success' : 'secondary'}">${u.active ? 'Activo' : 'Inactivo'}</span></td>
          <td>${App.formatDate(u.created_at)}</td>
        </tr>`;
      });
    });
  },

  showAddUser() {
    App.openModal('Nuevo Usuario', `
      <div class="mb-3">
        <label class="form-label">Usuario *</label>
        <input type="text" class="form-control" id="regUser" required>
      </div>
      <div class="mb-3">
        <label class="form-label">Nombre Completo *</label>
        <input type="text" class="form-control" id="regName" required>
      </div>
      <div class="mb-3">
        <label class="form-label">Contraseña * (mín. 6 caracteres)</label>
        <input type="password" class="form-control" id="regPass" required>
      </div>
      <div class="mb-3">
        <label class="form-label">Rol *</label>
        <select class="form-select" id="regRole">
          <option value="contador">Contador</option>
          <option value="auxiliar">Auxiliar</option>
          <option value="admin">Administrador</option>
        </select>
      </div>
    `, () => {
      const data = {
        username: document.getElementById('regUser').value.trim(),
        full_name: document.getElementById('regName').value.trim(),
        password: document.getElementById('regPass').value,
        role: document.getElementById('regRole').value,
      };
      if (!data.username || !data.full_name || !data.password) {
        App.toast('Complete todos los campos', 'error'); return;
      }
      API.register(data).then(() => {
        App.toast('Usuario creado exitosamente');
        App.closeModal();
        App.navigate('users');
      }).catch(e => App.toast(e.message, 'error'));
    });
  },
};

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('sidebar-overlay-active');
  document.body.classList.toggle('mobile-nav-open');
}

document.addEventListener('DOMContentLoaded', () => Auth.init());
