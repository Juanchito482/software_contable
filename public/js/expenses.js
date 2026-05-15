const Expenses = {
  allExpenses: [],

  render(container) {
    const canWrite = Auth.canWrite();
    container.innerHTML = `
      <div class="page-header">
        <h2>Gastos</h2>
        ${canWrite ? '<button class="btn btn-primary" onclick="Expenses.showForm()"><i class="bi bi-plus-lg"></i> Nuevo Gasto</button>' : ''}
      </div>
      <div class="filter-bar">
        <input type="date" class="form-control" id="expStart" onchange="Expenses.applyFilters()">
        <input type="date" class="form-control" id="expEnd" onchange="Expenses.applyFilters()">
        <select class="form-select" id="expCategory" onchange="Expenses.applyFilters()">
          <option value="">Todas las categorías</option>
        </select>
        <button class="btn btn-outline-success" onclick="Expenses.exportPDF()"><i class="bi bi-filetype-pdf"></i></button>
        <button class="btn btn-outline-success" onclick="Expenses.exportExcel()"><i class="bi bi-file-earmark-excel"></i></button>
      </div>
      <div class="card">
        <div class="card-body">
          <div class="table-container">
            <table class="table table-hover">
              <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Monto</th><th>Descripción</th>${canWrite ? '<th style="width:120px">Acciones</th>' : ''}</tr></thead>
              <tbody id="expensesBody"></tbody>
            </table>
          </div>
          <div id="expensesTotal" class="text-end mt-3"></div>
        </div>
      </div>
      <div id="expensesEmpty" class="empty-state" style="display:none">
        <i class="bi bi-cart"></i>
        <p>No hay gastos registrados</p>
      </div>
    `;
    API.getConfig('categories').then(cats => {
      const sel = document.getElementById('expCategory');
      cats.forEach(c => { sel.innerHTML += `<option value="${c}">${c}</option>`; });
    });
    this.load();
  },

  load() {
    API.getExpenses().then(expenses => {
      this.allExpenses = expenses;
      this.renderTable(expenses);
    }).catch(e => App.toast(e.message, 'error'));
  },

  renderTable(expenses) {
    const tbody = document.getElementById('expensesBody');
    const empty = document.getElementById('expensesEmpty');
    const totalDiv = document.getElementById('expensesTotal');
    if (!tbody) return;
    if (expenses.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      if (totalDiv) totalDiv.innerHTML = '';
      return;
    }
    if (empty) empty.style.display = 'none';
    const canWrite = Auth.canWrite();
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const categoryColors = { Servicios: '#c62828', Materiales: '#1565c0', Salarios: '#2e7d32', Mantenimiento: '#f57c00', Publicidad: '#6a1b9a', Eventos: '#00838f', Transporte: '#d81b60', Otros: '#546e7a' };
    tbody.innerHTML = expenses.map(e => `
      <tr>
        <td>${App.formatDate(e.expense_date)}</td>
        <td><strong>${e.concept}</strong></td>
        <td><span class="badge-concept" style="background:${categoryColors[e.category] || '#546e7a'}20;color:${categoryColors[e.category] || '#546e7a'}">${e.category}</span></td>
        <td><strong>${App.formatCurrency(e.amount)}</strong></td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.description || '-'}</td>
        ${canWrite ? `<td>
          <button class="btn btn-sm btn-outline-primary btn-action" onclick="Expenses.showForm(${e.id})" title="Editar"><i class="bi bi-pencil"></i></button>
          ${Auth.isAdmin() ? `<button class="btn btn-sm btn-outline-danger btn-action" onclick="Expenses.confirmDelete(${e.id})" title="Eliminar"><i class="bi bi-trash"></i></button>` : ''}
        </td>` : ''}
      </tr>
    `).join('');
    if (totalDiv) totalDiv.innerHTML = '<strong>Total: ' + App.formatCurrency(total) + '</strong>';
  },

  applyFilters() {
    let filtered = this.allExpenses;
    const start = document.getElementById('expStart').value;
    const end = document.getElementById('expEnd').value;
    const category = document.getElementById('expCategory').value;
    if (start) filtered = filtered.filter(e => e.expense_date >= start);
    if (end) filtered = filtered.filter(e => e.expense_date <= end);
    if (category) filtered = filtered.filter(e => e.category === category);
    this.renderTable(filtered);
  },

  showForm(id) {
    const isEdit = !!id;
    API.getConfig('categories').then(cats => {
      const catOpts = cats.map(c => `<option value="${c}">${c}</option>`).join('');
      if (isEdit) {
        API.getExpense(id).then(e => {
          App.openModal('Editar Gasto', `
            <input type="hidden" id="expId" value="${e.id}">
            <div class="mb-3"><label class="form-label">Concepto *</label><input type="text" class="form-control" id="eConcept" value="${e.concept}"></div>
            <div class="row"><div class="col-md-6 mb-3"><label class="form-label">Monto *</label><input type="number" class="form-control" id="eAmount" value="${e.amount}" min="1"></div>
            <div class="col-md-6 mb-3"><label class="form-label">Fecha *</label><input type="date" class="form-control" id="eDate" value="${e.expense_date}"></div></div>
            <div class="mb-3"><label class="form-label">Categoría *</label><select class="form-select" id="eCategory">${catOpts.replace(`value="${e.category}"`, `value="${e.category}" selected`)}</select></div>
            <div class="mb-3"><label class="form-label">Descripción</label><textarea class="form-control" id="eDesc" rows="2">${e.description || ''}</textarea></div>
          `, () => this.save(id));
        });
      } else {
        App.openModal('Nuevo Gasto', `
          <div class="mb-3"><label class="form-label">Concepto *</label><input type="text" class="form-control" id="eConcept"></div>
          <div class="row"><div class="col-md-6 mb-3"><label class="form-label">Monto *</label><input type="number" class="form-control" id="eAmount" min="1"></div>
          <div class="col-md-6 mb-3"><label class="form-label">Fecha *</label><input type="date" class="form-control" id="eDate" value="${new Date().toISOString().split('T')[0]}"></div></div>
          <div class="mb-3"><label class="form-label">Categoría *</label><select class="form-select" id="eCategory">${catOpts}</select></div>
          <div class="mb-3"><label class="form-label">Descripción</label><textarea class="form-control" id="eDesc" rows="2"></textarea></div>
        `, () => this.save(null));
      }
    });
  },

  save(id) {
    const data = {
      concept: document.getElementById('eConcept').value.trim(),
      amount: parseFloat(document.getElementById('eAmount').value),
      expense_date: document.getElementById('eDate').value,
      category: document.getElementById('eCategory').value,
      description: document.getElementById('eDesc').value.trim() || null,
    };
    if (!data.concept || !data.amount || !data.expense_date || !data.category) {
      App.toast('Complete todos los campos requeridos', 'error'); return;
    }
    if (data.amount <= 0) { App.toast('El monto debe ser mayor a 0', 'error'); return; }
    const req = id ? API.updateExpense(id, data) : API.createExpense(data);
    req.then(() => {
      App.toast(id ? 'Gasto actualizado' : 'Gasto registrado');
      App.closeModal();
      this.load();
    }).catch(e => App.toast(e.message, 'error'));
  },

  confirmDelete(id) {
    App.confirm('¿Eliminar este gasto?', () => {
      API.deleteExpense(id).then(() => {
        App.toast('Gasto eliminado');
        this.load();
      }).catch(e => App.toast(e.message, 'error'));
    });
  },

  exportPDF() {
    const start = document.getElementById('expStart').value;
    const end = document.getElementById('expEnd').value;
    let params = '?type=expenses';
    if (start && end) params += '&start=' + start + '&end=' + end;
    API.exportPDF(params);
  },

  exportExcel() {
    const start = document.getElementById('expStart').value;
    const end = document.getElementById('expEnd').value;
    let params = '?type=expenses';
    if (start && end) params += '&start=' + start + '&end=' + end;
    API.exportExcel(params);
  }
};
