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
    const toast = document.getElementById('toast');

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
        fetchData();
    });

    // === Search ===
    searchInput.addEventListener('input', () => {
        renderTable(filterData(searchInput.value.trim()));
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
                        </tr>
                    </thead>
                    <tbody>
        `;

        data.forEach((record, index) => {
            const createdAt = new Date(record.created_at).toLocaleString('zh-CN', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit'
            });

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
                <tr>
                    <td>${index + 1}</td>
                    <td><strong>${escapeHtml(record.nickname)}</strong></td>
                    <td>${escapeHtml(record.qq_number)}</td>
                    <td>${uidHtml}</td>
                    <td class="uid-date">${createdAt}</td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        dataArea.innerHTML = html;
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
