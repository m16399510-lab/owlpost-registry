// ============================================
// Owlpost 学籍登记 - 管理后台逻辑
// ============================================

(function () {
    'use strict';

    const { createClient } = supabase;
    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // State
    let adminUsername = '';
    let adminPassword = '';
    let allData = [];
    let editingId = null;
    let deletingId = null;
    let duplicateIds = new Set(); // IDs of duplicate records

    // DOM
    const loginView = document.getElementById('loginView');
    const dashboardView = document.getElementById('dashboardView');
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const loginText = document.getElementById('loginText');
    const loginSpinner = document.getElementById('loginSpinner');
    const dataArea = document.getElementById('dataArea');
    const searchInput = document.getElementById('searchInput');
    const refreshBtn = document.getElementById('refreshBtn');
    const dupCheckBtn = document.getElementById('dupCheckBtn');
    const toast = document.getElementById('toast');

    // Edit Modal DOM
    const editModal = document.getElementById('editModal');
    const editForm = document.getElementById('editForm');
    const editModalClose = document.getElementById('editModalClose');
    const editCancelBtn = document.getElementById('editCancelBtn');
    const editAddUidBtn = document.getElementById('editAddUidBtn');
    const editUidList = document.getElementById('editUidList');
    const editSaveBtn = document.getElementById('editSaveBtn');
    const editSaveText = document.getElementById('editSaveText');
    const editSaveSpinner = document.getElementById('editSaveSpinner');

    // Delete Modal DOM
    const deleteModal = document.getElementById('deleteModal');
    const deleteModalClose = document.getElementById('deleteModalClose');
    const deleteCancelBtn = document.getElementById('deleteCancelBtn');
    const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');
    const deleteConfirmText = document.getElementById('deleteConfirmText');
    const deleteConfirmSpinner = document.getElementById('deleteConfirmSpinner');
    const deleteTargetName = document.getElementById('deleteTargetName');

    // === Login ===
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        adminUsername = document.getElementById('adminUsername').value.trim();
        adminPassword = document.getElementById('adminPassword').value;

        if (!adminUsername || !adminPassword) {
            showToast('请输入用户名和密码', 'error');
            return;
        }

        setLoginLoading(true);
        const success = await fetchData();
        setLoginLoading(false);

        if (success) {
            loginView.style.display = 'none';
            dashboardView.style.display = 'block';
        }
    });

    // === Refresh ===
    refreshBtn.addEventListener('click', () => {
        duplicateIds.clear();
        fetchData();
    });

    // === Search ===
    searchInput.addEventListener('input', () => {
        renderTable(filterData(searchInput.value.trim()));
    });

    // === Duplicate Check ===
    dupCheckBtn.addEventListener('click', () => {
        findDuplicates();
        renderTable(filterData(searchInput.value.trim()));
        const count = duplicateIds.size;
        if (count > 0) {
            showToast(`发现 ${count} 条重复记录，已用橙色高亮标记`, 'error');
        } else {
            showToast('未发现重复记录 ✨', 'success');
        }
    });

    // === Fetch Data ===
    async function fetchData() {
        dataArea.innerHTML = `
            <div class="loading-overlay">
                <span class="spinner"></span>
                <span>正在加载数据...</span>
            </div>
        `;

        try {
            const { data, error } = await db.rpc('admin_get_registry', {
                p_username: adminUsername,
                p_password: adminPassword
            });

            if (error) {
                console.error('RPC error:', error);
                showToast('查询失败：' + error.message, 'error');
                return false;
            }

            if (!data.success) {
                showToast(data.message || '登录失败', 'error');
                return false;
            }

            allData = data.data || [];
            updateStats();
            renderTable(allData);
            return true;

        } catch (err) {
            console.error('Network error:', err);
            showToast('网络错误，请重试', 'error');
            return false;
        }
    }

    // === Find Duplicates ===
    function findDuplicates() {
        duplicateIds.clear();

        // Check duplicate QQ numbers
        const qqMap = {};
        allData.forEach(record => {
            const qq = record.qq_number;
            if (!qqMap[qq]) qqMap[qq] = [];
            qqMap[qq].push(record.id);
        });
        Object.values(qqMap).forEach(ids => {
            if (ids.length > 1) ids.forEach(id => duplicateIds.add(id));
        });

        // Check duplicate UIDs
        const uidMap = {};
        allData.forEach(record => {
            if (record.uids) {
                record.uids.forEach(uid => {
                    const uidLower = uid.toLowerCase();
                    if (!uidMap[uidLower]) uidMap[uidLower] = [];
                    uidMap[uidLower].push(record.id);
                });
            }
        });
        Object.values(uidMap).forEach(ids => {
            if (ids.length > 1) ids.forEach(id => duplicateIds.add(id));
        });
    }

    // === Update Stats ===
    function updateStats() {
        document.getElementById('statTotal').textContent = allData.length;

        let activeCount = 0;
        let trialCount = 0;
        let expiredCount = 0;

        allData.forEach(record => {
            if (!record.uid_details) return;
            record.uid_details.forEach(detail => {
                const status = getSubscriptionStatus(detail);
                if (status.type === 'active') activeCount++;
                else if (status.type === 'trial') trialCount++;
                else if (status.type === 'expired') expiredCount++;
            });
        });

        document.getElementById('statActive').textContent = activeCount;
        document.getElementById('statTrial').textContent = trialCount;
        document.getElementById('statExpired').textContent = expiredCount;
    }

    // === Filter ===
    function filterData(query) {
        if (!query) return allData;
        const q = query.toLowerCase();
        return allData.filter(record =>
            record.nickname.toLowerCase().includes(q) ||
            record.qq_number.includes(q) ||
            (record.uids && record.uids.some(uid => uid.toLowerCase().includes(q)))
        );
    }

    // === Determine Subscription Status ===
    function getSubscriptionStatus(uidDetail) {
        if (!uidDetail) return { type: 'unknown', label: '未找到', icon: '❓' };

        // If account_status exists and is not normal
        const accountStatus = uidDetail.account_status;
        if (accountStatus === 'suspended' || accountStatus === 'banned') {
            return { type: 'suspended', label: '已停用', icon: '🚫' };
        }

        const endDate = uidDetail.subscription_end_date;

        // No subscription record found for this UID
        if (!endDate && !accountStatus) {
            return { type: 'unknown', label: '未找到', icon: '❓' };
        }

        if (!endDate) {
            return { type: 'trial', label: '试用中', icon: '⏳' };
        }

        const end = new Date(endDate);
        const now = new Date();

        if (end > now) {
            const daysRemaining = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
            const dateStr = end.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
            return {
                type: 'active',
                label: `正式（到 ${dateStr}）`,
                icon: '✅',
                daysRemaining
            };
        } else {
            return { type: 'expired', label: '已过期', icon: '❌' };
        }
    }

    // === Render Table ===
    function renderTable(data) {
        if (!data || data.length === 0) {
            dataArea.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <p>暂无登记数据</p>
                </div>
            `;
            return;
        }

        let html = `
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>昵称</th>
                            <th>QQ号</th>
                            <th>UID 与订阅状态</th>
                            <th>登记时间</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.forEach((record, index) => {
            const createdAt = new Date(record.created_at).toLocaleString('zh-CN', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit'
            });

            const isDup = duplicateIds.has(record.id);
            const rowClass = isDup ? 'duplicate-row' : '';

            // Build UID details
            let uidHtml = '<div class="uid-detail">';
            if (record.uid_details && record.uid_details.length > 0) {
                record.uid_details.forEach(detail => {
                    const status = getSubscriptionStatus(detail);
                    uidHtml += `
                        <div class="uid-item">
                            <span class="uid-text">${escapeHtml(detail.uid)}</span>
                            <span class="status-badge ${status.type}">${status.icon} ${status.label}</span>
                        </div>
                    `;
                });
            } else if (record.uids && record.uids.length > 0) {
                record.uids.forEach(uid => {
                    uidHtml += `
                        <div class="uid-item">
                            <span class="uid-text">${escapeHtml(uid)}</span>
                            <span class="status-badge unknown">❓ 未查询到</span>
                        </div>
                    `;
                });
            } else {
                uidHtml += '<span class="uid-text">无 UID</span>';
            }
            uidHtml += '</div>';

            html += `
                <tr class="${rowClass}" data-id="${record.id}">
                    <td>${index + 1}</td>
                    <td><strong>${escapeHtml(record.nickname)}</strong></td>
                    <td>${escapeHtml(record.qq_number)}</td>
                    <td>${uidHtml}</td>
                    <td class="uid-date">${createdAt}</td>
                    <td class="action-cell">
                        <button class="btn btn-action btn-edit" onclick="adminAction('edit', ${record.id})" title="编辑">✏️</button>
                        <button class="btn btn-action btn-delete" onclick="adminAction('delete', ${record.id})" title="删除">🗑️</button>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        dataArea.innerHTML = html;
    }

    // === Global Action Handler ===
    window.adminAction = function (action, id) {
        const record = allData.find(r => r.id === id);
        if (!record) {
            showToast('未找到记录', 'error');
            return;
        }

        if (action === 'edit') {
            openEditModal(record);
        } else if (action === 'delete') {
            openDeleteModal(record);
        }
    };

    // === Edit Modal ===
    function openEditModal(record) {
        editingId = record.id;
        document.getElementById('editNickname').value = record.nickname;
        document.getElementById('editQqNumber').value = record.qq_number;

        // Populate UIDs
        editUidList.innerHTML = '';
        const uids = record.uids || [];
        if (uids.length === 0) {
            addEditUidRow('');
        } else {
            uids.forEach(uid => addEditUidRow(uid));
        }

        editModal.classList.add('show');
    }

    function addEditUidRow(value) {
        const count = editUidList.querySelectorAll('.uid-row').length + 1;
        const row = document.createElement('div');
        row.className = 'uid-row';
        row.innerHTML = `
            <span class="uid-index">${count}</span>
            <input type="text" class="form-input uid-input" placeholder="输入UID" value="${escapeHtml(value)}" required>
            ${count > 1 ? '<button type="button" class="btn btn-icon btn-remove" onclick="removeEditUid(this)" title="移除">✕</button>' : ''}
        `;
        editUidList.appendChild(row);
    }

    window.removeEditUid = function (btn) {
        const row = btn.closest('.uid-row');
        row.style.transition = 'all 0.2s ease';
        row.style.opacity = '0';
        row.style.transform = 'translateX(10px)';
        setTimeout(() => {
            row.remove();
            updateEditUidIndices();
        }, 200);
    };

    function updateEditUidIndices() {
        const rows = editUidList.querySelectorAll('.uid-row');
        rows.forEach((row, i) => {
            row.querySelector('.uid-index').textContent = i + 1;
            // Only the first row shouldn't have a remove button
            const removeBtn = row.querySelector('.btn-remove');
            if (i === 0 && removeBtn) removeBtn.remove();
        });
    }

    editAddUidBtn.addEventListener('click', () => {
        const count = editUidList.querySelectorAll('.uid-row').length;
        if (count >= 10) {
            showToast('最多 10 个 UID', 'error');
            return;
        }
        addEditUidRow('');
        const inputs = editUidList.querySelectorAll('.uid-input');
        inputs[inputs.length - 1].focus();
    });

    function closeEditModal() {
        editModal.classList.remove('show');
        editingId = null;
    }

    editModalClose.addEventListener('click', closeEditModal);
    editCancelBtn.addEventListener('click', closeEditModal);
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) closeEditModal();
    });

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nickname = document.getElementById('editNickname').value.trim();
        const qqNumber = document.getElementById('editQqNumber').value.trim();
        const uidInputs = editUidList.querySelectorAll('.uid-input');
        const uids = [];

        if (!nickname) { showToast('请填写昵称', 'error'); return; }
        if (!qqNumber || !/^\d+$/.test(qqNumber)) { showToast('请输入正确的QQ号', 'error'); return; }

        uidInputs.forEach(input => {
            const val = input.value.trim();
            if (val) uids.push(val);
        });

        if (uids.length === 0) { showToast('请至少填写一个UID', 'error'); return; }

        const uniqueUids = [...new Set(uids)];
        if (uniqueUids.length !== uids.length) {
            showToast('存在重复的UID，请检查', 'error');
            return;
        }

        setEditLoading(true);

        try {
            const { data, error } = await db.rpc('admin_update_registry', {
                p_username: adminUsername,
                p_password: adminPassword,
                p_id: editingId,
                p_nickname: nickname,
                p_qq_number: qqNumber,
                p_uids: uniqueUids
            });

            if (error) {
                showToast('更新失败：' + error.message, 'error');
                setEditLoading(false);
                return;
            }

            if (data && !data.success) {
                showToast(data.message || '更新失败', 'error');
                setEditLoading(false);
                return;
            }

            showToast('记录已更新 ✨', 'success');
            closeEditModal();
            setEditLoading(false);
            await fetchData();

        } catch (err) {
            console.error('Update error:', err);
            showToast('网络错误，请重试', 'error');
            setEditLoading(false);
        }
    });

    function setEditLoading(loading) {
        editSaveBtn.disabled = loading;
        editSaveText.style.display = loading ? 'none' : 'inline';
        editSaveSpinner.style.display = loading ? 'inline-block' : 'none';
    }

    // === Delete Modal ===
    function openDeleteModal(record) {
        deletingId = record.id;
        deleteTargetName.textContent = record.nickname;
        deleteModal.classList.add('show');
    }

    function closeDeleteModal() {
        deleteModal.classList.remove('show');
        deletingId = null;
    }

    deleteModalClose.addEventListener('click', closeDeleteModal);
    deleteCancelBtn.addEventListener('click', closeDeleteModal);
    deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) closeDeleteModal();
    });

    deleteConfirmBtn.addEventListener('click', async () => {
        if (!deletingId) return;

        setDeleteLoading(true);

        try {
            const { data, error } = await db.rpc('admin_delete_registry', {
                p_username: adminUsername,
                p_password: adminPassword,
                p_id: deletingId
            });

            if (error) {
                showToast('删除失败：' + error.message, 'error');
                setDeleteLoading(false);
                return;
            }

            if (data && !data.success) {
                showToast(data.message || '删除失败', 'error');
                setDeleteLoading(false);
                return;
            }

            showToast('记录已删除', 'success');
            closeDeleteModal();
            setDeleteLoading(false);
            duplicateIds.clear();
            await fetchData();

        } catch (err) {
            console.error('Delete error:', err);
            showToast('网络错误，请重试', 'error');
            setDeleteLoading(false);
        }
    });

    function setDeleteLoading(loading) {
        deleteConfirmBtn.disabled = loading;
        deleteConfirmText.style.display = loading ? 'none' : 'inline';
        deleteConfirmSpinner.style.display = loading ? 'inline-block' : 'none';
    }

    // === Helpers ===
    function setLoginLoading(loading) {
        loginBtn.disabled = loading;
        loginText.style.display = loading ? 'none' : 'inline';
        loginSpinner.style.display = loading ? 'inline-block' : 'none';
    }

    function showToast(message, type = 'success') {
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.offsetHeight;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
})();
