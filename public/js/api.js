const API = {
  base: '',

  getToken() {
    return localStorage.getItem('token');
  },

  request(method, path, body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const token = this.getToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body) opts.body = JSON.stringify(body);
    return fetch(this.base + path, opts).then(async r => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error del servidor');
      return data;
    });
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  put(path, body) { return this.request('PUT', path, body); },
  del(path) { return this.request('DELETE', path); },

  login(username, password) { return this.post('/api/auth/login', { username, password }); },
  register(data) { return this.post('/api/auth/register', data); },
  getMe() { return this.get('/api/auth/me'); },

  getStudents(params = '') { return this.get('/api/students' + params); },
  searchStudents(q) { return this.get('/api/students/search?q=' + encodeURIComponent(q)); },
  getStudent(id) { return this.get('/api/students/' + id); },
  createStudent(data) { return this.post('/api/students', data); },
  updateStudent(id, data) { return this.put('/api/students/' + id, data); },
  deleteStudent(id) { return this.del('/api/students/' + id); },

  getPayments(params = '') { return this.get('/api/payments' + params); },
  createPayment(data) { return this.post('/api/payments', data); },
  deletePayment(id) { return this.del('/api/payments/' + id); },

  getExpenses(params = '') { return this.get('/api/expenses' + params); },
  getExpense(id) { return this.get('/api/expenses/' + id); },
  createExpense(data) { return this.post('/api/expenses', data); },
  updateExpense(id, data) { return this.put('/api/expenses/' + id, data); },
  deleteExpense(id) { return this.del('/api/expenses/' + id); },

  getSummary() { return this.get('/api/reports/summary'); },
  getReportRange(params) { return this.get('/api/reports/range' + params); },
  getReportByStudent(id) { return this.get('/api/reports/by-student/' + id); },

  getAudit(params = '') { return this.get('/api/audit' + params); },

  getConfig(name) { return this.get('/api/config/' + name); },
  getUsers() { return this.get('/api/users'); },

  downloadFile(url, filename) {
    const token = this.getToken();
    return fetch(this.base + url, {
      headers: { 'Authorization': 'Bearer ' + token }
    }).then(async r => {
      if (!r.ok) { const err = await r.json().catch(() => ({ error: 'Error al descargar' })); throw new Error(err.error); }
      const blob = await r.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    });
  },
  exportPDF(params) { this.downloadFile('/api/export/pdf' + params, 'reporte.pdf').catch(e => App.toast(e.message, 'error')); },
  exportExcel(params) { this.downloadFile('/api/export/excel' + params, 'reporte.xlsx').catch(e => App.toast(e.message, 'error')); },
};
