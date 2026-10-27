/**
 * FocusFlow — app.js
 *
 * ARCHITECTURE OVERVIEW
 * ─────────────────────
 * This app follows a simple pattern called "state → render":
 *
 *   1. STATE: All task data lives in one array called `tasks`.
 *      Each task is a plain JavaScript object with properties
 *      like id, title, priority, completed, etc.
 *
 *   2. ACTIONS: When the user does something (add, complete, delete),
 *      we update the `tasks` array and save it to localStorage.
 *
 *   3. RENDER: After every change, we call `renderTasks()` which
 *      completely redraws the task list from the current `tasks` array.
 *
 * This means the UI is always a direct reflection of the data.
 * It's predictable, debuggable, and easy to extend.
 */

'use strict'; // Catch common mistakes (using undeclared variables, etc.)

/* ══════════════════════════════════════════════════════════════
   1. STATE
   The single source of truth for all task data.
══════════════════════════════════════════════════════════════ */

// Load saved tasks from localStorage, or start with an empty array.
// JSON.parse converts the stored string back into a JavaScript array.
// The '||' means: "if localStorage is empty/null, use []".
let tasks = JSON.parse(localStorage.getItem('ff-tasks')) || [];

// Active filters — track what the user has selected
let activeFilter   = 'all';    // 'all' | 'active' | 'completed'
let activePriority = 'all';    // 'all' | 'high' | 'medium' | 'low'
let activeSort     = 'created-desc';

/* ══════════════════════════════════════════════════════════════
   2. DOM REFERENCES
   Cache (store) references to HTML elements we'll use often.
   Doing this once is faster than calling getElementById every time.
══════════════════════════════════════════════════════════════ */

const taskForm      = document.getElementById('task-form');
const taskTitleInput = document.getElementById('task-title');
const taskPriority  = document.getElementById('task-priority');
const taskCategory  = document.getElementById('task-category');
const taskDue       = document.getElementById('task-due');
const titleError    = document.getElementById('title-error');

const taskList      = document.getElementById('task-list');
const emptyState    = document.getElementById('empty-state');
const emptyMessage  = document.getElementById('empty-message');

const statTotal     = document.getElementById('stat-total');
const statActive    = document.getElementById('stat-active');
const statDone      = document.getElementById('stat-done');

const sortSelect        = document.getElementById('sort-select');
const clearCompletedBtn = document.getElementById('clear-completed');
const themeToggleBtn    = document.getElementById('theme-toggle');

const filterBtns   = document.querySelectorAll('[data-filter]');
const priorityBtns = document.querySelectorAll('[data-priority]');

/* ══════════════════════════════════════════════════════════════
   3. UTILITY FUNCTIONS
   Small, focused helpers used by multiple parts of the app.
══════════════════════════════════════════════════════════════ */

/**
 * generateId — create a simple unique ID for each task.
 * We use Date.now() (milliseconds since 1970) + a random number
 * to make collisions practically impossible.
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * saveTasks — persist the tasks array to localStorage.
 * JSON.stringify converts the JavaScript array into a string
 * (localStorage can only store strings, not objects/arrays).
 */
function saveTasks() {
  localStorage.setItem('ff-tasks', JSON.stringify(tasks));
}

/**
 * formatDate — convert a date string like "2026-11-01" to "1 Nov 2026".
 * We add 'T12:00:00' to avoid timezone issues that can shift the date by one day.
 */
function formatDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * isOverdue — returns true if a task has a due date in the past
 * and is not yet completed.
 */
function isOverdue(task) {
  if (!task.due || task.completed) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0); // compare dates, not times
  const due = new Date(task.due + 'T12:00:00');
  return due < today;
}

/* ══════════════════════════════════════════════════════════════
   4. FILTER AND SORT
   Returns a filtered + sorted copy of tasks based on active
   filter state. Never modifies the original tasks array.
══════════════════════════════════════════════════════════════ */

function getFilteredTasks() {
  // Step 1: Filter by completion status
  let result = tasks.filter(function(task) {
    if (activeFilter === 'active')    return !task.completed;
    if (activeFilter === 'completed') return task.completed;
    return true; // 'all'
  });

  // Step 2: Filter by priority
  if (activePriority !== 'all') {
    result = result.filter(function(task) {
      return task.priority === activePriority;
    });
  }

  // Step 3: Sort
  result.sort(function(a, b) {
    if (activeSort === 'created-asc')  return a.createdAt - b.createdAt;
    if (activeSort === 'created-desc') return b.createdAt - a.createdAt;

    if (activeSort === 'due-asc') {
      // Tasks with no due date go to the bottom
      if (!a.due && !b.due) return 0;
      if (!a.due) return 1;
      if (!b.due) return -1;
      return new Date(a.due) - new Date(b.due);
    }

    if (activeSort === 'priority-desc') {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    }

    return 0;
  });

  return result;
}

/* ══════════════════════════════════════════════════════════════
   5. RENDER
   Builds HTML from the current tasks array and injects it
   into the DOM. Called after every state change.
══════════════════════════════════════════════════════════════ */

function renderTasks() {
  const filtered = getFilteredTasks();

  // Clear the list — we rebuild it from scratch each render
  taskList.innerHTML = '';

  if (filtered.length === 0) {
    // Show the empty state with an appropriate message
    emptyState.hidden = false;
    emptyMessage.textContent = tasks.length === 0
      ? 'No tasks yet. Add one above to get started.'
      : 'No tasks match the current filter.';
  } else {
    emptyState.hidden = true;

    // Build a list item for each task
    filtered.forEach(function(task) {
      const li = createTaskElement(task);
      taskList.appendChild(li);
    });
  }

  updateStats();
}

/**
 * createTaskElement — builds and returns one <li> element for a task.
 *
 * KEY CONCEPT: We create elements with document.createElement,
 * set their properties, and attach them to the DOM with appendChild.
 * We also attach event listeners directly to each element so clicking
 * the checkbox or delete button knows which task to affect.
 */
function createTaskElement(task) {
  const li = document.createElement('li');
  li.className = 'task-item' + (task.completed ? ' completed' : '');
  li.dataset.priority = task.priority; // used by CSS for the left border colour
  li.dataset.id = task.id;

  // Build meta tags (priority badge + optional category + optional due date)
  let metaHTML = `
    <span class="priority-badge priority-badge--${task.priority}">
      ${task.priority}
    </span>
  `;

  if (task.category) {
    metaHTML += `
      <span class="tag">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
        ${escapeHTML(task.category)}
      </span>
    `;
  }

  if (task.due) {
    const overdue = isOverdue(task);
    metaHTML += `
      <span class="tag ${overdue ? 'tag--overdue' : ''}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
        ${overdue ? 'Overdue · ' : ''}${formatDate(task.due)}
      </span>
    `;
  }

  // Use innerHTML to set the inner structure of this list item.
  // SECURITY NOTE: task.title is run through escapeHTML() to prevent
  // XSS (cross-site scripting) — a real vulnerability where user input
  // containing <script> tags could run malicious code.
  li.innerHTML = `
    <input
      type="checkbox"
      class="task-checkbox"
      aria-label="Mark '${escapeHTML(task.title)}' as ${task.completed ? 'incomplete' : 'complete'}"
      ${task.completed ? 'checked' : ''}
    />
    <div class="task-item__body">
      <p class="task-item__title">${escapeHTML(task.title)}</p>
      <div class="task-item__meta">${metaHTML}</div>
    </div>
    <div class="task-item__actions">
      <button
        class="btn btn--danger btn--sm"
        aria-label="Delete task: ${escapeHTML(task.title)}"
        title="Delete task"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>
      </button>
    </div>
  `;

  // Attach event listeners to this specific task's checkbox and delete button
  const checkbox = li.querySelector('.task-checkbox');
  const deleteBtn = li.querySelector('.btn--danger');

  checkbox.addEventListener('change', function() {
    toggleTask(task.id);
  });

  deleteBtn.addEventListener('click', function() {
    deleteTask(task.id, li);
  });

  return li;
}

/**
 * escapeHTML — prevents XSS by converting special characters.
 * For example: '<script>' becomes '&lt;script&gt;'
 */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * updateStats — recalculate and update the three stat numbers.
 */
function updateStats() {
  const total     = tasks.length;
  const completed = tasks.filter(function(t) { return t.completed; }).length;
  const active    = total - completed;

  statTotal.textContent = total;
  statActive.textContent = active;
  statDone.textContent  = completed;
}

/* ══════════════════════════════════════════════════════════════
   6. ACTIONS
   Functions that modify the tasks array.
   Every action saves to localStorage and re-renders.
══════════════════════════════════════════════════════════════ */

/**
 * addTask — create a new task object and add it to the array.
 *
 * A task is a plain object with these properties:
 *   id        — unique identifier
 *   title     — the task text
 *   priority  — 'high' | 'medium' | 'low'
 *   category  — optional string
 *   due       — optional date string (YYYY-MM-DD)
 *   completed — boolean, starts as false
 *   createdAt — timestamp (used for sorting)
 */
function addTask(title, priority, category, due) {
  const newTask = {
    id:        generateId(),
    title:     title.trim(),
    priority:  priority,
    category:  category.trim(),
    due:       due,
    completed: false,
    createdAt: Date.now()
  };

  // Add to the beginning of the array (newest first by default)
  tasks.unshift(newTask);
  saveTasks();
  renderTasks();
}

/**
 * toggleTask — flip a task's completed status.
 * We use Array.find() to locate the task by its id, then flip the boolean.
 */
function toggleTask(id) {
  const task = tasks.find(function(t) { return t.id === id; });
  if (task) {
    task.completed = !task.completed;
    saveTasks();
    renderTasks();
  }
}

/**
 * deleteTask — remove a task from the array.
 * We use Array.filter() to return a new array without the deleted task,
 * then replace tasks with that new array.
 */
function deleteTask(id, element) {
  // Animate out before removing from DOM
  element.style.transition = 'opacity 200ms, transform 200ms';
  element.style.opacity = '0';
  element.style.transform = 'translateX(20px)';

  setTimeout(function() {
    tasks = tasks.filter(function(t) { return t.id !== id; });
    saveTasks();
    renderTasks();
  }, 200);
}

/**
 * clearCompleted — remove all tasks where completed === true.
 */
function clearCompleted() {
  const count = tasks.filter(function(t) { return t.completed; }).length;
  if (count === 0) return;

  const confirmed = window.confirm(
    `Remove ${count} completed task${count === 1 ? '' : 's'}?`
  );
  if (confirmed) {
    tasks = tasks.filter(function(t) { return !t.completed; });
    saveTasks();
    renderTasks();
  }
}

/* ══════════════════════════════════════════════════════════════
   7. FORM VALIDATION
   Runs before addTask to make sure inputs are acceptable.
══════════════════════════════════════════════════════════════ */

function validateForm(title) {
  let valid = true;

  if (!title.trim()) {
    titleError.textContent = 'Please enter a task name.';
    taskTitleInput.focus();
    taskTitleInput.setAttribute('aria-invalid', 'true');
    valid = false;
  } else {
    titleError.textContent = '';
    taskTitleInput.removeAttribute('aria-invalid');
  }

  return valid;
}

/* ══════════════════════════════════════════════════════════════
   8. EVENT LISTENERS
   Connect user actions to our functions.
══════════════════════════════════════════════════════════════ */

// ── Form submit ──
taskForm.addEventListener('submit', function(event) {
  // Prevent the default browser behaviour (page reload on form submit)
  event.preventDefault();

  const title    = taskTitleInput.value;
  const priority = taskPriority.value;
  const category = taskCategory.value;
  const due      = taskDue.value;

  if (!validateForm(title)) return; // stop if validation fails

  addTask(title, priority, category, due);

  // Reset form fields after successful add
  taskForm.reset();
  taskTitleInput.focus(); // put cursor back in title field
});

// Clear error when user starts typing again
taskTitleInput.addEventListener('input', function() {
  if (taskTitleInput.value.trim()) {
    titleError.textContent = '';
    taskTitleInput.removeAttribute('aria-invalid');
  }
});

// ── Filter buttons (status) ──
filterBtns.forEach(function(btn) {
  btn.addEventListener('click', function() {
    activeFilter = btn.dataset.filter;

    // Update active class — remove from all, add to clicked
    filterBtns.forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');

    renderTasks();
  });
});

// ── Filter buttons (priority) ──
priorityBtns.forEach(function(btn) {
  btn.addEventListener('click', function() {
    activePriority = btn.dataset.priority;

    priorityBtns.forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');

    renderTasks();
  });
});

// ── Sort ──
sortSelect.addEventListener('change', function() {
  activeSort = sortSelect.value;
  renderTasks();
});

// ── Clear completed ──
clearCompletedBtn.addEventListener('click', clearCompleted);

// ── Theme toggle ──
themeToggleBtn.addEventListener('click', function() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('ff-theme', 'light');
    themeToggleBtn.setAttribute('aria-label', 'Switch to dark mode');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('ff-theme', 'dark');
    themeToggleBtn.setAttribute('aria-label', 'Switch to light mode');
  }
});

/* ══════════════════════════════════════════════════════════════
   9. INITIALISE
   Run once when the page loads.
══════════════════════════════════════════════════════════════ */

// Set theme toggle aria-label based on current theme
(function initThemeLabel() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  themeToggleBtn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
})();

// Set minimum due date to today (can't set tasks due in the past)
(function setMinDate() {
  const today = new Date().toISOString().split('T')[0];
  taskDue.setAttribute('min', today);
})();

// Render the initial task list (from localStorage, or empty)
renderTasks();
