class CollegeMS {
    constructor() {
        this.baseURL = '/api';
        this.token = localStorage.getItem('token');
        this.user = JSON.parse(localStorage.getItem('user') || '{}');
        this.init();
    }

    async init() {
        this.initTheme();
        this.initAuth();
        this.bindGlobalEvents();
    }

    // Theme Management
    initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);

        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.innerHTML = savedTheme === 'dark' ? '☀️' : '🌙';
            themeToggle.addEventListener('click', this.toggleTheme.bind(this));
        }
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);

        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.innerHTML = newTheme === 'dark' ? '☀️' : '🌙';
        }
    }

    // Authentication Management
    initAuth() {
        const currentPath = window.location.pathname;
        const publicPaths = ['/index.html', '/pages/login.html', '/'];

        if (!this.token && !publicPaths.some(path => currentPath.includes(path))) {
            this.redirectToLogin();
            return;
        }

        if (this.token && this.user.role) {
            this.updateNavigation();
        }
    }

    redirectToLogin() {
        window.location.href = '/pages/login.html';
    }

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        this.redirectToLogin();
    }

    updateNavigation() {
        const userNameElement = document.getElementById('user-name');
        if (userNameElement) {
            userNameElement.textContent = this.user.name;
        }

        // Update navigation based on role
        this.updateRoleBasedNav();
    }

    updateRoleBasedNav() {
        const navMenu = document.querySelector('.nav-menu');
        if (!navMenu) return;

        const roleLinks = {
            student: [
                { text: 'Dashboard', href: '/pages/student/dashboard.html' },
                { text: 'Attendance', href: '/pages/student/attendance.html' },
                { text: 'Assignments', href: '/pages/student/assignments.html' },
                { text: 'CGPA', href: '/pages/student/cgpa.html' },
                { text: 'Messages', href: '/pages/student/messages.html' },
                { text: '👤 Profile', href: '/pages/student/profile.html' }  // ✅ ADD THIS
            ],
            teacher: [
                { text: 'Dashboard', href: '/pages/teacher/dashboard.html' },
                { text: 'Attendance', href: '/pages/teacher/attendance.html' },
                { text: 'Grading', href: '/pages/teacher/grading.html' },
                { text: 'Messages', href: '/pages/teacher/messages.html' },
                { text: '👤 Profile', href: '/pages/teacher/profile.html' }  // ✅ ADD THIS
            ],
            admin: [
                { text: 'Dashboard', href: '/pages/admin/dashboard.html' },
                { text: 'Users', href: '/pages/admin/users.html' },
                { text: 'Classes', href: '/pages/admin/classes.html' },
                { text: 'Announcements', href: '/pages/admin/announcements.html' },
                { text: '👤 Profile', href: '/pages/admin/profile.html' }  // ✅ ADD THIS
            ]
        };

        // Rest of your function stays the same


        const links = roleLinks[this.user.role] || [];
        const currentPath = window.location.pathname;

        // Clear existing links except theme toggle and logout
        const existingLinks = navMenu.querySelectorAll('li:not(.keep)');
        existingLinks.forEach(li => li.remove());

        // Add role-specific links
        links.forEach(link => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = link.href;
            a.textContent = link.text;

            if (currentPath.includes(link.href.split('/').pop())) {
                a.classList.add('active');
            }

            li.appendChild(a);
            navMenu.insertBefore(li, navMenu.lastElementChild?.previousElementSibling);
        });
    }

    bindGlobalEvents() {
        // Global logout function
        window.logout = () => this.logout();

        // Global API call function
        window.api = this.apiCall.bind(this);

        // Global notification function
        window.showNotification = this.showNotification.bind(this);
    }

    // API Management
    async apiCall(endpoint, options = {}) {
        // ✅ Always fetch the latest token from localStorage
        const token = localStorage.getItem('token');

        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            },
            ...options
        };

        // Handle FormData (for file uploads)
        if (options.body instanceof FormData) {
            delete config.headers['Content-Type'];
        }

        try {
            const response = await fetch(this.baseURL + endpoint, config);
            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    this.logout();
                    return;
                }
                throw new Error(data.message || 'Something went wrong');
            }

            return data;
        } catch (error) {
            this.showNotification(error.message, 'error');
            throw error;
        }
    }


    // UI Helpers
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
      <span>${message}</span>
      <button onclick="this.parentElement.remove()" style="background:none;border:none;color:inherit;margin-left:10px;cursor:pointer;">×</button>
    `;

        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    showLoading(element) {
        if (element) {
            element.innerHTML = '<div class="loading"></div>';
        }
    }

    hideLoading(element, originalContent = '') {
        if (element) {
            element.innerHTML = originalContent;
        }
    }

    formatDate(date, options = {}) {
        return new Date(date).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            ...options
        });
    }

    formatTime(date) {
        return new Date(date).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    calculatePercentage(part, total) {
        return total > 0 ? Math.round((part / total) * 100) : 0;
    }

    // Utility Functions
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    validateForm(formElement) {
        const inputs = formElement.querySelectorAll('input[required], select[required], textarea[required]');
        let isValid = true;

        inputs.forEach(input => {
            const errorElement = input.parentElement.querySelector('.form-error');
            if (errorElement) {
                errorElement.remove();
            }

            if (!input.value.trim()) {
                this.showFieldError(input, 'This field is required');
                isValid = false;
            } else if (input.type === 'email' && !this.validateEmail(input.value)) {
                this.showFieldError(input, 'Please enter a valid email');
                isValid = false;
            }
        });

        return isValid;
    }

    showFieldError(input, message) {
        const errorElement = document.createElement('div');
        errorElement.className = 'form-error';
        errorElement.textContent = message;
        input.parentElement.appendChild(errorElement);
    }

    // Modal Management
    showModal(title, content, actions = []) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
      <div class="modal-content">
        <h3>${title}</h3>
        <div class="modal-body">${content}</div>
        <div class="modal-actions" style="margin-top: 20px; display: flex; gap: 12px; justify-content: flex-end;">
          ${actions.map(action => `
            <button class="btn ${action.class || 'btn-secondary'}" onclick="${action.onclick}">
              ${action.text}
            </button>
          `).join('')}
          <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
        </div>
      </div>
    `;

        document.body.appendChild(modal);
        return modal;
    }

    // File Upload Helper
    async uploadFile(file, endpoint) {
        const formData = new FormData();
        formData.append('file', file);

        return this.apiCall(endpoint, {
            method: 'POST',
            body: formData
        });
    }
}

// Initialize the app
const app = new CollegeMS();

// Global utility functions
function formatDate(date) {
    return app.formatDate(date);
}

function formatTime(date) {
    return app.formatTime(date);
}

function showNotification(message, type) {
    app.showNotification(message, type);
}
