class DashboardManager {
  constructor() {
    this.userRole = app.user.role;
    this.init();
  }

  async init() {
    await this.loadDashboardData();
    this.initializeWidgets();
  }

  async loadDashboardData() {
    try {
      const endpoint = `/${this.userRole}/dashboard`;
      const data = await app.apiCall(endpoint);

      this.renderDashboard(data);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    }
  }

  renderDashboard(data) {
    // Update user name
    const userNameElement = document.getElementById('user-name');
    if (userNameElement) {
      userNameElement.textContent = app.user.name;
    }

    // Role-specific rendering
    switch (this.userRole) {
      case 'student':
        this.renderStudentDashboard(data);
        break;
      case 'teacher':
        this.renderTeacherDashboard(data);
        break;
      case 'admin':
        this.renderAdminDashboard(data);
        break;
    }
  }

  renderStudentDashboard(data) {
    // Update attendance percentage
    const attendanceElement = document.getElementById('overall-attendance');
    if (attendanceElement) {
      attendanceElement.textContent = `${data.overallAttendance}%`;
    }

    // Update pending assignments
    const assignmentsElement = document.getElementById('pending-assignments');
    if (assignmentsElement) {
      assignmentsElement.textContent = data.pendingAssignments;
    }

    // Render subject-wise attendance
    this.renderSubjectAttendance(data.attendanceBySubject);

    // Render recent assignments
    this.renderRecentAssignments(data.recentAssignments);
  }

  renderTeacherDashboard(data) {
    // Update stats
    const statsElements = {
      'total-subjects': data.totalSubjects,
      'total-students': data.totalStudents,
      'today-attendance': data.todayAttendanceMarked
    };

    Object.entries(statsElements).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = value;
      }
    });

    // Render subjects
    this.renderTeacherSubjects(data.subjects);

    // Render recent assignments
    this.renderRecentAssignments(data.recentAssignments);
  }

  renderAdminDashboard(data) {
    // Update stats
    const statsElements = {
      'total-students': data.totalStudents,
      'total-teachers': data.totalTeachers,
      'total-classes': data.totalClasses,
      'total-subjects': data.totalSubjects
    };

    Object.entries(statsElements).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = value;
      }
    });

    // Render recent users
    this.renderRecentUsers(data.recentUsers);

    // Render class statistics
    this.renderClassStats(data.classStats);
  }
  displayRecentAssignments(assignments) {
    const container = document.getElementById('recent-assignments');

    if (!assignments || assignments.length === 0) {
      container.innerHTML = '<p>No assignments found.</p>';
      return;
    }

    container.innerHTML = assignments.map(assignment => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #eee;">
            <div>
                <h4 style="margin: 0; font-size: 14px;">📝 ${assignment.title}</h4>
                <p style="margin: 0; color: #666; font-size: 12px;">Due: ${new Date(assignment.dueDate).toLocaleDateString()}</p>
            </div>
            <button style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;" 
                    onclick="deleteAssignment('${assignment._id}')">
                🗑️
            </button>
        </div>
    `).join('');
  }



  renderSubjectAttendance(attendanceData) {
    const container = document.getElementById('subject-attendance');
    if (!container || !attendanceData) return;

    container.innerHTML = `
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Present</th>
              <th>Total</th>
              <th>Percentage</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${attendanceData.map(subject => {
      const percentage = app.calculatePercentage(subject.presentClasses, subject.totalClasses);
      const status = percentage >= 75 ? 'good' : percentage >= 65 ? 'warning' : 'danger';

      return `
                <tr>
                  <td>${subject._id ? 'Subject' : 'Unknown'}</td>
                  <td>${subject.presentClasses}</td>
                  <td>${subject.totalClasses}</td>
                  <td>
                    <span class="text-${status}">${percentage}%</span>
                    <div class="progress">
                      <div class="progress-bar ${status}" style="width: ${percentage}%"></div>
                    </div>
                  </td>
                  <td>
                    <span class="status status-${status}">
                      ${percentage >= 75 ? 'Good' : percentage >= 65 ? 'Warning' : 'Low'}
                    </span>
                  </td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderRecentAssignments(assignments) {
    const container = document.getElementById('recent-assignments');
    if (!container || !assignments) return;

    if (assignments.length === 0) {
      container.innerHTML = '<p class="text-secondary">No recent assignments</p>';
      return;
    }

    container.innerHTML = assignments.map(assignment => `
      <div class="assignment-card card">
        <div class="assignment-header">
          <div>
            <h4 class="assignment-title">${assignment.title}</h4>
            <span class="assignment-subject">${assignment.subject?.name}</span>
          </div>
          <span class="assignment-due">Due: ${app.formatDate(assignment.dueDate)}</span>
        </div>
        <p class="assignment-description">${assignment.description}</p>
        ${this.userRole === 'student' ? `
          <div class="assignment-actions">
            <a href="/pages/student/assignments.html" class="btn btn-primary btn-sm">View Details</a>
          </div>
        ` : `
          <div class="assignment-actions">
            <span class="text-secondary">${assignment.totalSubmissions || 0} submissions</span>
          </div>
        `}
      </div>
    `).join('');
  }

  renderTeacherSubjects(subjects) {
    const container = document.getElementById('teacher-subjects');
    if (!container || !subjects) return;

    container.innerHTML = `
      <div class="grid grid-cols-2">
        ${subjects.map(subject => `
          <div class="card">
            <h4>${subject.name}</h4>
            <p class="text-secondary">${subject.code}</p>
            <p class="text-secondary">${subject.class?.name} - ${subject.class?.branch} Year ${subject.class?.year}</p>
            <div class="mt-2">
              <a href="/pages/teacher/attendance.html?subject=${subject._id}" class="btn btn-primary btn-sm">Mark Attendance</a>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderRecentUsers(users) {
    const container = document.getElementById('recent-users');
    if (!container || !users) return;

    container.innerHTML = `
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(user => `
              <tr>
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td><span class="status">${user.role}</span></td>
                <td>${app.formatDate(user.createdAt)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderClassStats(classStats) {
    const container = document.getElementById('class-stats');
    if (!container || !classStats) return;

    container.innerHTML = `
      <div class="grid grid-cols-3">
        ${classStats.map(cls => `
          <div class="card text-center">
            <h4>${cls.name}</h4>
            <p class="text-secondary">${cls.branch} - Year ${cls.year}</p>
            <div class="metric">
              <span class="metric-value">${cls.studentCount}</span>
              <span class="metric-label">Students</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  initializeWidgets() {
    // Initialize any interactive widgets
    this.initQuickActions();
    this.initRefreshButton();
  }

  initQuickActions() {
    const quickActions = document.querySelectorAll('.quick-action');
    quickActions.forEach(action => {
      action.addEventListener('click', (e) => {
        e.preventDefault();
        const href = action.getAttribute('href');
        if (href) {
          window.location.href = href;
        }
      });
    });
  }

  initRefreshButton() {
    const refreshButton = document.getElementById('refresh-dashboard');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        this.loadDashboardData();
        showNotification('Dashboard refreshed!', 'success');
      });
    }
  }
}

// Initialize dashboard when DOM loads
document.addEventListener('DOMContentLoaded', () => {
  if (app.user.role) {
    new DashboardManager();
  }
});
