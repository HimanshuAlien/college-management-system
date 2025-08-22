class AuthManager {
    constructor() {
        this.initLoginForm();
        this.checkExistingAuth();
    }

    checkExistingAuth() {
        const token = localStorage.getItem('token');
        const user = JSON.parse(localStorage.getItem('user') || '{}');

        if (token && user.role) {
            this.redirectToDashboard(user.role);
        }
    }

    initLoginForm() {
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', this.handleLogin.bind(this));
        }

        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', this.handleRegister.bind(this));
            this.loadClasses();
        }
    }

    async handleLogin(e) {
        e.preventDefault();

        const formData = new FormData(e.target);
        const loginData = {
            email: formData.get('email'),
            password: formData.get('password')
        };

        const submitButton = e.target.querySelector('button[type="submit"]');
        const originalText = submitButton.innerHTML;

        try {
            submitButton.innerHTML = '<div class="loading"></div> Logging in...';
            submitButton.disabled = true;

            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(loginData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message);
            }

            // Store token and user data
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));

            showNotification('Login successful!', 'success');

            setTimeout(() => {
                this.redirectToDashboard(data.user.role);
            }, 1000);

        } catch (error) {
            showNotification(error.message, 'error');
        } finally {
            submitButton.innerHTML = originalText;
            submitButton.disabled = false;
        }
    }

    async handleRegister(e) {
        e.preventDefault();

        const formData = new FormData(e.target);
        const registerData = Object.fromEntries(formData.entries());

        // Validate password confirmation
        if (registerData.password !== registerData.confirmPassword) {
            showNotification('Passwords do not match', 'error');
            return;
        }

        delete registerData.confirmPassword;

        const submitButton = e.target.querySelector('button[type="submit"]');
        const originalText = submitButton.innerHTML;

        try {
            submitButton.innerHTML = '<div class="loading"></div> Creating account...';
            submitButton.disabled = true;

            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(registerData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message);
            }

            showNotification('Account created successfully!', 'success');

            setTimeout(() => {
                window.location.href = '/pages/login.html';
            }, 1000);

        } catch (error) {
            showNotification(error.message, 'error');
        } finally {
            submitButton.innerHTML = originalText;
            submitButton.disabled = false;
        }
    }

    async loadClasses() {
        try {
            const response = await fetch('/api/admin/classes');
            const data = await response.json();

            const classSelect = document.getElementById('classId');
            if (classSelect && data.classes) {
                classSelect.innerHTML = '<option value="">Select Class</option>';
                data.classes.forEach(cls => {
                    classSelect.innerHTML += `
            <option value="${cls._id}">${cls.name} - ${cls.branch} Year ${cls.year}</option>
          `;
                });
            }
        } catch (error) {
            console.error('Failed to load classes:', error);
        }
    }

    redirectToDashboard(role) {
        const dashboards = {
            student: '/pages/student/dashboard.html',
            teacher: '/pages/teacher/dashboard.html',
            admin: '/pages/admin/dashboard.html'
        };

        window.location.href = dashboards[role] || '/';
    }

    toggleAuthForm() {
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');

        if (loginForm && registerForm) {
            loginForm.classList.toggle('hidden');
            registerForm.classList.toggle('hidden');
        }
    }
}

// Role-based field toggling
function toggleRoleFields() {
    const role = document.getElementById('role')?.value;
    const studentFields = document.getElementById('student-fields');
    const teacherFields = document.getElementById('teacher-fields');

    if (studentFields && teacherFields) {
        studentFields.style.display = role === 'student' ? 'block' : 'none';
        teacherFields.style.display = role === 'teacher' ? 'block' : 'none';
    }
}

// Initialize auth manager when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    new AuthManager();
});
