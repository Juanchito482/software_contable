const Auth = {
  user: null,

  init() {
    document.getElementById('loginForm').addEventListener('submit', e => {
      e.preventDefault();
      this.login();
    });
    document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
    this.checkSession();
  },

  checkSession() {
    const token = API.getToken();
    if (!token) { this.showLogin(); return; }
    API.getMe().then(r => {
      this.user = r.user;
      this.showApp();
      App.init();
    }).catch(() => {
      localStorage.removeItem('token');
      this.showLogin();
    });
  },

  login() {
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    const errDiv = document.getElementById('loginError');
    errDiv.innerHTML = '';
    if (!username || !password) {
      errDiv.innerHTML = '<div class="alert alert-danger">Ingrese usuario y contraseña</div>';
      return;
    }
    API.login(username, password).then(r => {
      localStorage.setItem('token', r.token);
      this.user = r.user;
      this.showApp();
      App.init();
    }).catch(e => {
      errDiv.innerHTML = '<div class="alert alert-danger">' + e.message + '</div>';
    });
  },

  logout() {
    localStorage.removeItem('token');
    this.user = null;
    this.showLogin();
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
    App.destroy();
  },

  showLogin() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display = 'none';
  },

  showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'flex';
    document.getElementById('sidebarUserName').textContent = this.user.full_name;
    const roleMap = { admin: 'Administrador', contador: 'Contador', auxiliar: 'Auxiliar' };
    document.getElementById('sidebarUserRole').textContent = roleMap[this.user.role] || this.user.role;
    if (this.user.role === 'admin') {
      document.getElementById('navUsers').style.display = '';
    }
  },

  canWrite() {
    return this.user && (this.user.role === 'admin' || this.user.role === 'contador');
  },

  isAdmin() {
    return this.user && this.user.role === 'admin';
  }
};
