// ============================================
// Owlpost 学籍登记 - 用户提交逻辑
// ============================================

(function () {
    'use strict';

    // Initialize Supabase client
    const { createClient } = supabase;
    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // DOM Elements
    const form = document.getElementById('registrationForm');
    const uidList = document.getElementById('uidList');
    const addUidBtn = document.getElementById('addUidBtn');
    const submitBtn = document.getElementById('submitBtn');
    const submitText = document.getElementById('submitText');
    const submitSpinner = document.getElementById('submitSpinner');
    const toast = document.getElementById('toast');
    const successOverlay = document.getElementById('successOverlay');

    let uidCount = 1;

    // === UID Management ===
    addUidBtn.addEventListener('click', () => {
        if (uidCount >= 10) {
            showToast('最多添加 10 个 UID', 'error');
            return;
        }
        uidCount++;
        const row = document.createElement('div');
        row.className = 'uid-row';
        row.dataset.index = uidCount - 1;
        row.innerHTML = `
            <span class="uid-index">${uidCount}</span>
            <input type="text" class="form-input uid-input" placeholder="输入UID" required>
            <button type="button" class="btn btn-icon btn-remove" onclick="removeUid(this)" title="移除">✕</button>
        `;
        uidList.appendChild(row);
        row.querySelector('.uid-input').focus();
    });

    // Global function for inline onclick
    window.removeUid = function (btn) {
        const row = btn.closest('.uid-row');
        row.style.transition = 'all 0.2s ease';
        row.style.opacity = '0';
        row.style.transform = 'translateX(10px)';
        setTimeout(() => {
            row.remove();
            uidCount--;
            updateUidIndices();
        }, 200);
    };

    function updateUidIndices() {
        const rows = uidList.querySelectorAll('.uid-row');
        rows.forEach((row, i) => {
            row.querySelector('.uid-index').textContent = i + 1;
        });
    }

    // === Form Submission ===
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nickname = document.getElementById('nickname').value.trim();
        const qqNumber = document.getElementById('qqNumber').value.trim();
        const uidInputs = uidList.querySelectorAll('.uid-input');
        const uids = [];

        // Validate
        if (!nickname) {
            showToast('请填写昵称', 'error');
            return;
        }
        if (!qqNumber || !/^\d+$/.test(qqNumber)) {
            showToast('请输入正确的QQ号', 'error');
            return;
        }

        uidInputs.forEach(input => {
            const val = input.value.trim();
            if (val) uids.push(val);
        });

        if (uids.length === 0) {
            showToast('请至少填写一个UID', 'error');
            return;
        }

        // Check duplicates
        const uniqueUids = [...new Set(uids)];
        if (uniqueUids.length !== uids.length) {
            showToast('存在重复的UID，请检查', 'error');
            return;
        }

        // Submit
        setLoading(true);

        try {
            const { error } = await db
                .from('student_registry')
                .insert({
                    nickname: nickname,
                    qq_number: qqNumber,
                    uids: uniqueUids
                });

            if (error) {
                console.error('提交失败:', error);
                showToast('提交失败：' + error.message, 'error');
                setLoading(false);
                return;
            }

            // Success!
            setLoading(false);
            showSuccess();

        } catch (err) {
            console.error('网络错误:', err);
            showToast('网络请求失败，请检查网络连接', 'error');
            setLoading(false);
        }
    });

    // === UI Helpers ===
    function setLoading(loading) {
        submitBtn.disabled = loading;
        submitText.style.display = loading ? 'none' : 'inline';
        submitSpinner.style.display = loading ? 'inline-block' : 'none';
    }

    function showToast(message, type = 'success') {
        toast.textContent = message;
        toast.className = `toast ${type}`;
        // Force reflow
        toast.offsetHeight;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    function showSuccess() {
        successOverlay.classList.add('show');
        setTimeout(() => {
            successOverlay.classList.remove('show');
            form.reset();
            // Reset UID list to single input
            uidList.innerHTML = `
                <div class="uid-row" data-index="0">
                    <span class="uid-index">1</span>
                    <input type="text" class="form-input uid-input" placeholder="输入UID" required>
                </div>
            `;
            uidCount = 1;
        }, 2500);
    }
})();
