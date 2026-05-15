const Students = {
  allStudents: [],

  render(container) {
    const canWrite = Auth.canWrite();
    container.innerHTML = `
      <div class="page-header">
        <h2>Estudiantes</h2>
        ${canWrite ? '<button class="btn btn-primary" onclick="Students.showForm()"><i class="bi bi-plus-lg"></i> Nuevo Estudiante</button>' : ''}
      </div>
      <div class="filter-bar">
        <div class="search-box">
          <i class="bi bi-search search-icon"></i>
          <input type="text" class="form-control" placeholder="Buscar estudiante..." id="studentSearch" oninput="Students.search(this.value)">
        </div>
        <select class="form-select" id="gradeFilter" onchange="Students.applyFilters()">
          <option value="">Todos los cursos</option>
          <option value="Párvulo">Párvulo</option>
          <option value="Pre Jardín">Pre Jardín</option>
          <option value="Jardín">Jardín</option>
          <option value="Transición">Transición</option>
          <option value="Primero">Primero</option>
          <option value="Segundo">Segundo</option>
        </select>
        <select class="form-select" id="statusFilter" onchange="Students.applyFilters()">
          <option value="">Todos los estados</option>
          <option value="activo">Activos</option>
          <option value="inactivo">Inactivos</option>
        </select>
      </div>
      <div class="card">
        <div class="card-body">
          <div class="table-container">
            <table class="table table-hover">
              <thead><tr>
                <th>Nombre</th><th>Grado</th><th>Acudiente</th><th>Teléfono</th><th>Estado</th>
                ${canWrite ? '<th style="width:120px">Acciones</th>' : ''}
              </tr></thead>
              <tbody id="studentsBody"></tbody>
            </table>
          </div>
        </div>
      </div>
      <div id="studentEmpty" class="empty-state" style="display:none">
        <i class="bi bi-people"></i>
        <p>No hay estudiantes registrados</p>
      </div>
    `;
    this.load();
  },

  load() {
    API.getStudents().then(students => {
      this.allStudents = students;
      this.renderTable(students);
    }).catch(e => App.toast(e.message, 'error'));
  },

  renderTable(students) {
    const tbody = document.getElementById('studentsBody');
    const empty = document.getElementById('studentEmpty');
    if (!tbody) return;
    if (students.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    const canWrite = Auth.canWrite();
    tbody.innerHTML = students.map(s => `
      <tr>
        <td><strong>${s.full_name}</strong></td>
        <td><span class="grade-badge">${s.grade}</span></td>
        <td>${s.guardian_name || '-'}</td>
        <td>${s.guardian_phone || '-'}</td>
        <td><span class="badge bg-${s.status === 'activo' ? 'success' : 'secondary'}">${s.status}</span></td>
        ${canWrite ? `<td>
          <button class="btn btn-sm btn-outline-primary btn-action" onclick="Students.showForm(${s.id})" title="Editar"><i class="bi bi-pencil"></i></button>
          ${Auth.isAdmin() ? `<button class="btn btn-sm btn-outline-danger btn-action" onclick="Students.confirmDelete(${s.id})" title="Eliminar"><i class="bi bi-trash"></i></button>` : ''}
        </td>` : ''}
      </tr>
    `).join('');
  },

  applyFilters() {
    const grade = document.getElementById('gradeFilter').value;
    const status = document.getElementById('statusFilter').value;
    const search = document.getElementById('studentSearch').value.toLowerCase();
    let filtered = this.allStudents;
    if (grade) filtered = filtered.filter(s => s.grade === grade);
    if (status) filtered = filtered.filter(s => s.status === status);
    if (search) filtered = filtered.filter(s => s.full_name.toLowerCase().includes(search) || (s.guardian_name && s.guardian_name.toLowerCase().includes(search)));
    this.renderTable(filtered);
  },

  search(q) {
    if (q.length > 1) {
      API.searchStudents(q).then(students => {
        this.renderTable(students);
      }).catch(() => {});
    } else if (q.length === 0) {
      this.renderTable(this.allStudents);
    }
  },

  showForm(id) {
    const isEdit = !!id;
    const title = isEdit ? 'Editar Estudiante' : 'Nuevo Estudiante';
    API.getConfig('grades').then(grades => {
      const gradeOpts = grades.map(g => `<option value="${g}">${g}</option>`).join('');
      if (isEdit) {
        API.getStudent(id).then(s => {
          App.openModal(title, `
            <input type="hidden" id="studentId" value="${s.id}">
            <div class="mb-3"><label class="form-label">Nombre Completo *</label><input type="text" class="form-control" id="sName" value="${s.full_name}"></div>
            <div class="mb-3"><label class="form-label">Grado *</label><select class="form-select" id="sGrade">${gradeOpts.replace(`value="${s.grade}"`, `value="${s.grade}" selected`)}</select></div>
            <div class="mb-3"><label class="form-label">Acudiente</label><input type="text" class="form-control" id="sGuardian" value="${s.guardian_name || ''}"></div>
            <div class="row"><div class="col-md-6 mb-3"><label class="form-label">Teléfono</label><input type="text" class="form-control" id="sPhone" value="${s.guardian_phone || ''}"></div>
            <div class="col-md-6 mb-3"><label class="form-label">Email</label><input type="email" class="form-control" id="sEmail" value="${s.guardian_email || ''}"></div></div>
            <div class="mb-3"><label class="form-label">Dirección</label><input type="text" class="form-control" id="sAddress" value="${s.address || ''}"></div>
            <div class="mb-3"><label class="form-label">Estado</label><select class="form-select" id="sStatus"><option value="activo" ${s.status === 'activo' ? 'selected' : ''}>Activo</option><option value="inactivo" ${s.status === 'inactivo' ? 'selected' : ''}>Inactivo</option></select></div>
          `, () => Students.save(id));
        });
      } else {
        App.openModal(title, `
          <div class="mb-3"><label class="form-label">Nombre Completo *</label><input type="text" class="form-control" id="sName"></div>
          <div class="mb-3"><label class="form-label">Grado *</label><select class="form-select" id="sGrade">${gradeOpts}</select></div>
          <div class="mb-3"><label class="form-label">Acudiente</label><input type="text" class="form-control" id="sGuardian"></div>
          <div class="row"><div class="col-md-6 mb-3"><label class="form-label">Teléfono</label><input type="text" class="form-control" id="sPhone"></div>
          <div class="col-md-6 mb-3"><label class="form-label">Email</label><input type="email" class="form-control" id="sEmail"></div></div>
          <div class="mb-3"><label class="form-label">Dirección</label><input type="text" class="form-control" id="sAddress"></div>
        `, () => Students.save(null));
      }
    });
  },

  save(id) {
    const data = {
      full_name: document.getElementById('sName').value.trim(),
      grade: document.getElementById('sGrade').value,
      guardian_name: document.getElementById('sGuardian').value.trim() || null,
      guardian_phone: document.getElementById('sPhone').value.trim() || null,
      guardian_email: document.getElementById('sEmail').value.trim() || null,
      address: document.getElementById('sAddress').value.trim() || null,
    };
    if (id) data.status = document.getElementById('sStatus').value;
    if (!data.full_name || !data.grade) {
      App.toast('Nombre y grado son requeridos', 'error'); return;
    }
    const req = id ? API.updateStudent(id, data) : API.createStudent(data);
    req.then(() => {
      App.toast(id ? 'Estudiante actualizado' : 'Estudiante creado');
      App.closeModal();
      this.load();
    }).catch(e => App.toast(e.message, 'error'));
  },

  confirmDelete(id) {
    const s = this.allStudents.find(st => st.id === id);
    App.confirm(`¿Eliminar a "${s ? s.full_name : 'este estudiante'}"? Esta acción también eliminará sus pagos.`, () => {
      API.deleteStudent(id).then(() => {
        App.toast('Estudiante eliminado');
        this.load();
      }).catch(e => App.toast(e.message, 'error'));
    });
  },

  renderDashboard(container) {
    API.getSummary().then(summary => {
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      container.innerHTML = `
        <div class="page-header"><h2>Dashboard</h2><small class="text-muted">Resumen del mes actual</small></div>
        <div class="row g-3 mb-4">
          <div class="col-md-3 col-6"><div class="stat-card income"><div class="stat-icon"><i class="bi bi-cash-stack"></i></div><div class="stat-value">${App.formatCurrency(summary.totalIncome)}</div><div class="stat-label">Ingresos del Mes</div></div></div>
          <div class="col-md-3 col-6"><div class="stat-card expenses"><div class="stat-icon"><i class="bi bi-cart"></i></div><div class="stat-value">${App.formatCurrency(summary.totalExpenses)}</div><div class="stat-label">Gastos del Mes</div></div></div>
          <div class="col-md-3 col-6"><div class="stat-card balance"><div class="stat-icon"><i class="bi bi-graph-up-arrow"></i></div><div class="stat-value">${App.formatCurrency(summary.balance)}</div><div class="stat-label">Balance</div></div></div>
          <div class="col-md-3 col-6"><div class="stat-card students"><div class="stat-icon"><i class="bi bi-people"></i></div><div class="stat-value">${summary.totalStudents}</div><div class="stat-label">Estudiantes Activos</div></div></div>
        </div>
        <div class="row g-3">
          <div class="col-md-8"><div class="card"><div class="card-header">Ingresos vs Gastos (Mensual)</div><div class="card-body"><div class="chart-container"><canvas id="chartMonthly"></canvas></div></div></div></div>
          <div class="col-md-4"><div class="card"><div class="card-header">Gastos por Categoría</div><div class="card-body"><div class="chart-container"><canvas id="chartExpenses"></canvas></div></div></div></div>
          <div class="col-md-4"><div class="card"><div class="card-header">Ingresos por Concepto</div><div class="card-body"><div class="chart-container"><canvas id="chartIncome"></canvas></div></div></div></div>
          <div class="col-md-8"><div class="card"><div class="card-header">Últimos Ingresos</div><div class="card-body"><div class="table-container"><table class="table table-sm"><thead><tr><th>Fecha</th><th>Estudiante</th><th>Concepto</th><th>Monto</th></tr></thead><tbody id="dashPayments"></tbody></table></div></div></div></div>
        </div>
      `;
      setTimeout(() => {
        if (summary.monthly && summary.monthly.length) {
          new Chart(document.getElementById('chartMonthly'), {
            type: 'bar',
            data: {
              labels: summary.monthly.map(m => { const parts = m.mes.split('-'); return monthNames[parseInt(parts[1])-1] + ' ' + parts[0]; }),
              datasets: [
                { label: 'Ingresos', data: summary.monthly.map(m => m.ingresos), backgroundColor: '#2e7d32', borderRadius: 4 },
                { label: 'Gastos', data: summary.monthly.map(m => m.gastos), backgroundColor: '#c62828', borderRadius: 4 }
              ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }
          });
        }
        if (summary.expensesByCategory && summary.expensesByCategory.length) {
          new Chart(document.getElementById('chartExpenses'), {
            type: 'doughnut',
            data: {
              labels: summary.expensesByCategory.map(e => e.category),
              datasets: [{ data: summary.expensesByCategory.map(e => e.total), backgroundColor: ['#c62828','#1565c0','#f57c00','#2e7d32','#6a1b9a','#00838f','#d81b60','#546e7a'] }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
          });
        }
        if (summary.incomeByConcept && summary.incomeByConcept.length) {
          new Chart(document.getElementById('chartIncome'), {
            type: 'doughnut',
            data: {
              labels: summary.incomeByConcept.map(i => i.concept),
              datasets: [{ data: summary.incomeByConcept.map(i => i.total), backgroundColor: ['#2e7d32','#1565c0','#f57c00','#6a1b9a','#00838f','#d81b60'] }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
          });
        }
      }, 100);
      API.getPayments('?limit=10').then(p => {
        const tbody = document.getElementById('dashPayments');
        if (tbody) {
          if (p.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Sin pagos este mes</td></tr>'; return; }
          tbody.innerHTML = p.slice(0, 10).map(pmt => `<tr><td>${App.formatDate(pmt.payment_date)}</td><td>${pmt.student_name}</td><td><span class="badge-concept" style="background:#e8f5e9;color:#2e7d32">${pmt.concept}</span></td><td>${App.formatCurrency(pmt.amount)}</td></tr>`).join('');
        }
      }).catch(() => {});
    }).catch(e => { container.innerHTML = '<div class="alert alert-danger">Error al cargar dashboard: ' + e.message + '</div>'; });
  }
};
