// ============================================
// LiftLog v2.0 - Трекер силовых тренировок
// Модульная архитектура с улучшенной производительностью
// ============================================

// Конфигурация приложения
const CONFIG = {
    APP_NAME: 'LiftLog',
    VERSION: '2.0',
    STORAGE_KEY: 'liftlog-state-v2',
    DEFAULT_EXERCISES: [
        "Приседания со штангой",
        "Жим штанги лёжа",
        "Горизонтальная тяга блока",
        "Махи гантелями в стороны",
        "Подъёмы на носки стоя",
        "Подъём гантелей на бицепс",
        "Разгибание рук в кроссовере",
        "Гиперэкстензия с весом",
        "Жим ногами",
        "Жим гантелей лёжа под углом",
        "Тяга верхнего блока",
        "Жим гантелей сидя",
        "Обратная бабочка",
        "Подъёмы на носки сидя",
        "Молотки на бицепс"
    ],
    MUSCLE_GROUPS: ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'],
    EXERCISE_TYPES: ['strength', 'hypertrophy', 'accessory', 'warmup'],
    CHART_COLORS: {
        primary: '#3b82f6',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#8b5cf6'
    },
    DEBOUNCE_DELAY: 300,
    MAX_SETS: 10
};

// Состояние приложения
const state = {
    exercises: [],
    workouts: [],
    currentExercise: null,
    chart: null,
    theme: localStorage.getItem('liftlog-theme') || 'dark',
    lastSaved: null
};

// Утилиты
const utils = {
    // Дебаунс для оптимизации
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Форматирование даты
    formatDate(date, format = 'short') {
        const d = new Date(date);
        if (format === 'short') {
            return d.toLocaleDateString('ru-RU');
        } else if (format === 'long') {
            return d.toLocaleDateString('ru-RU', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } else if (format === 'relative') {
            const now = new Date();
            const diff = now - d;
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            
            if (days === 0) return 'Сегодня';
            if (days === 1) return 'Вчера';
            if (days < 7) return `${days} дня назад`;
            if (days < 30) return `${Math.floor(days / 7)} недели назад`;
            return `${Math.floor(days / 30)} месяца назад`;
        }
        return d.toISOString().split('T')[0];
    },

    // Форматирование чисел
    formatNumber(num, decimals = 1) {
        return num.toLocaleString('ru-RU', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    },

    // Расчет 1ПМ по формуле Epley
    calculate1RM(weight, reps) {
        return weight * (1 + reps / 30);
    },

    // Генератор уникальных ID
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // Валидация данных
    validateWorkoutData(data) {
        const errors = [];
        
        if (!data.date) errors.push('Укажите дату тренировки');
        if (!data.exercise) errors.push('Выберите упражнение');
        if (!data.sets || data.sets.length === 0) errors.push('Добавьте хотя бы один подход');
        
        data.sets?.forEach((set, index) => {
            if (!set.weight || set.weight <= 0) errors.push(`Подход ${index + 1}: некорректный вес`);
            if (!set.reps || set.reps <= 0) errors.push(`Подход ${index + 1}: некорректное количество повторений`);
        });
        
        return errors;
    },

    // Экспорт данных
    exportData() {
        const data = {
            app: CONFIG.APP_NAME,
            version: CONFIG.VERSION,
            exportedAt: new Date().toISOString(),
            exercises: state.exercises,
            workouts: state.workouts
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `liftlog-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // Импорт данных
    importData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    // Валидация импортируемых данных
                    if (!data.app || data.app !== CONFIG.APP_NAME) {
                        throw new Error('Некорректный формат файла');
                    }
                    
                    state.exercises = data.exercises || [];
                    state.workouts = data.workouts || [];
                    saveState();
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('Ошибка чтения файла'));
            reader.readAsText(file);
        });
    },

    // Копирование в буфер обмена
    copyToClipboard(text) {
        return navigator.clipboard.writeText(text);
    }
};

// Модуль управления состоянием
const store = {
    // Загрузка состояния
    load() {
        try {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                state.exercises = parsed.exercises || [];
                state.workouts = parsed.workouts || [];
                
                // Миграция старых данных
                this.migrateData();
            } else {
                // Инициализация при первом запуске
                this.initializeDefaultData();
            }
            
            // Загрузка темы
            this.loadTheme();
            
            console.log(`${CONFIG.APP_NAME} v${CONFIG.VERSION} загружен`);
            console.log(`Упражнений: ${state.exercises.length}, Тренировок: ${state.workouts.length}`);
            
            return true;
        } catch (error) {
            console.error('Ошибка загрузки состояния:', error);
            this.initializeDefaultData();
            return false;
        }
    },

    // Сохранение состояния
    save() {
        try {
            state.lastSaved = new Date().toISOString();
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({
                exercises: state.exercises,
                workouts: state.workouts,
                lastSaved: state.lastSaved
            }));
            return true;
        } catch (error) {
            console.error('Ошибка сохранения состояния:', error);
            this.showNotification('Ошибка сохранения данных', 'danger');
            return false;
        }
    },

    // Миграция данных
    migrateData() {
        // Миграция старых упражнений без ID
        state.exercises.forEach(exercise => {
            if (!exercise.id) {
                exercise.id = utils.generateId();
                exercise.createdAt = exercise.createdAt || new Date().toISOString();
                exercise.muscleGroup = exercise.muscleGroup || 'chest';
            }
        });

        // Миграция старых тренировок
        state.workouts.forEach(workout => {
            if (!workout.id) {
                workout.id = utils.generateId();
                workout.createdAt = workout.createdAt || new Date().toISOString();
                workout.notes = workout.notes || '';
            }
        });
    },

    // Инициализация данных по умолчанию
    initializeDefaultData() {
        state.exercises = CONFIG.DEFAULT_EXERCISES.map(name => ({
            id: utils.generateId(),
            name,
            type: 'strength',
            muscleGroup: 'chest',
            createdAt: new Date().toISOString()
        }));
        
        state.workouts = [];
        this.save();
    },

    // Загрузка темы
    loadTheme() {
        const savedTheme = localStorage.getItem('liftlog-theme');
        if (savedTheme) {
            state.theme = savedTheme;
            document.body.setAttribute('data-theme', savedTheme);
        }
    },

    // Переключение темы
    toggleTheme() {
        state.theme = state.theme === 'light' ? 'dark' : 'light';
        document.body.setAttribute('data-theme', state.theme);
        localStorage.setItem('liftlog-theme', state.theme);
        this.updateThemeIcon();
    },

    // Обновление иконки темы
    updateThemeIcon() {
        const icon = document.querySelector('#theme-toggle i');
        if (icon) {
            icon.className = state.theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        }
    },

    // Очистка всех данных
    clearAllData() {
        if (confirm('Вы уверены? Это удалит ВСЕ данные без возможности восстановления.')) {
            localStorage.removeItem(CONFIG.STORAGE_KEY);
            state.exercises = [];
            state.workouts = [];
            this.initializeDefaultData();
            this.showNotification('Все данные очищены', 'info');
            this.updateUI();
        }
    }
};

// Модуль уведомлений
const notifications = {
    show(message, type = 'info', duration = 3000) {
        const container = document.getElementById('notifications');
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.setAttribute('role', 'alert');
        
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };

        notification.innerHTML = `
            <div class="notification-icon">
                <i class="${icons[type] || icons.info}"></i>
            </div>
            <div class="notification-content">
                <div class="notification-title">${this.getTitle(type)}</div>
                <div class="notification-message">${message}</div>
            </div>
        `;

        container.appendChild(notification);

        // Автоматическое удаление
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOutRight 0.3s forwards';
                setTimeout(() => notification.remove(), 300);
            }
        }, duration);

        return notification;
    },

    getTitle(type) {
        const titles = {
            success: 'Успешно',
            error: 'Ошибка',
            warning: 'Внимание',
            info: 'Информация'
        };
        return titles[type] || 'Уведомление';
    }
};

// Модуль статистики
const statistics = {
    // Общая статистика
    getGeneralStats() {
        const totalWorkouts = state.workouts.length;
        const totalExercises = state.exercises.length;
        
        // Лучшее упражнение
        let bestExercise = { name: '-', weight: 0 };
        let bestWeight = 0;
        
        state.workouts.forEach(workout => {
            const maxWeight = Math.max(...workout.sets.map(s => s.weight));
            if (maxWeight > bestWeight) {
                bestWeight = maxWeight;
                bestExercise = { name: workout.exercise, weight: maxWeight };
            }
        });
        
        // Средний прогресс
        let avgProgress = 0;
        if (state.workouts.length > 0) {
            const progressData = this.calculateProgressForAllExercises();
            avgProgress = progressData.reduce((sum, p) => sum + p.progress, 0) / progressData.length;
        }
        
        // Рекомендации
        let recommendations = 0;
        state.exercises.forEach(exercise => {
            const progression = this.calculateProgression(exercise.name);
            if (progression.status === 'increase') recommendations++;
        });
        
        // Дополнительные метрики
        const totalVolume = this.calculateTotalVolume();
        const avgVolume = totalWorkouts > 0 ? totalVolume / totalWorkouts : 0;
        const workoutsPerWeek = this.calculateWorkoutsPerWeek();
        const monthProgress = this.calculateMonthlyProgress();
        
        return {
            totalWorkouts,
            bestExercise,
            avgProgress,
            recommendations,
            totalVolume,
            avgVolume,
            workoutsPerWeek,
            monthProgress
        };
    },

    // Расчет прогресса для всех упражнений
    calculateProgressForAllExercises() {
        return state.exercises.map(exercise => {
            const exerciseWorkouts = state.workouts
                .filter(w => w.exercise === exercise.name)
                .sort((a, b) => new Date(a.date) - new Date(b.date));
            
            if (exerciseWorkouts.length < 2) {
                return { exercise: exercise.name, progress: 0, status: 'insufficient-data' };
            }
            
            const first = exerciseWorkouts[0];
            const last = exerciseWorkouts[exerciseWorkouts.length - 1];
            
            const firstMax = Math.max(...first.sets.map(s => s.weight));
            const lastMax = Math.max(...last.sets.map(s => s.weight));
            
            const progress = ((lastMax - firstMax) / firstMax) * 100;
            
            return {
                exercise: exercise.name,
                progress: Math.max(0, progress),
                status: progress > 0 ? 'positive' : 'negative'
            };
        });
    },

    // Расчет общего объема
    calculateTotalVolume() {
        return state.workouts.reduce((total, workout) => {
            return total + workout.sets.reduce((sum, set) => sum + (set.weight * set.reps), 0);
        }, 0);
    },

    // Расчет тренировок в неделю
    calculateWorkoutsPerWeek() {
        if (state.workouts.length === 0) return 0;
        
        const dates = state.workouts.map(w => new Date(w.date));
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        
        const weeks = Math.ceil((maxDate - minDate) / (7 * 24 * 60 * 60 * 1000)) || 1;
        return state.workouts.length / weeks;
    },

    // Расчет месячного прогресса
    calculateMonthlyProgress() {
        const now = new Date();
        const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        
        const recentWorkouts = state.workouts
            .filter(w => new Date(w.date) >= monthAgo)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        
        if (recentWorkouts.length < 2) return 0;
        
        const first = recentWorkouts[0];
        const last = recentWorkouts[recentWorkouts.length - 1];
        
        const firstMax = Math.max(...first.sets.map(s => s.weight));
        const lastMax = Math.max(...last.sets.map(s => s.weight));
        
        return ((lastMax - firstMax) / firstMax) * 100;
    },

    // Алгоритм прогрессии (улучшенный)
    calculateProgression(exerciseName) {
        const exerciseWorkouts = state.workouts
            .filter(w => w.exercise === exerciseName)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        
        if (exerciseWorkouts.length < 2) {
            return {
                status: 'not-enough-data',
                message: 'Нужно больше тренировок для анализа',
                recommendation: 'Продолжайте тренироваться с текущими весами',
                icon: 'info'
            };
        }
        
        const lastWorkout = exerciseWorkouts[exerciseWorkouts.length - 1];
        const previousWorkout = exerciseWorkouts[exerciseWorkouts.length - 2];
        
        // Находим максимальный вес
        const lastMaxWeight = Math.max(...lastWorkout.sets.map(s => s.weight));
        const prevMaxWeight = Math.max(...previousWorkout.sets.map(s => s.weight));
        
        // Среднее количество повторений
        const lastAvgReps = lastWorkout.sets.reduce((sum, set) => sum + set.reps, 0) / lastWorkout.sets.length;
        const prevAvgReps = previousWorkout.sets.reduce((sum, set) => sum + set.reps, 0) / previousWorkout.sets.length;
        
        // Расчет объема
        const lastVolume = lastWorkout.sets.reduce((sum, set) => sum + (set.weight * set.reps), 0);
        const prevVolume = previousWorkout.sets.reduce((sum, set) => sum + (set.weight * set.reps), 0);
        
        // Анализ прогресса
        const weightProgress = ((lastMaxWeight - prevMaxWeight) / prevMaxWeight) * 100;
        const repsProgress = ((lastAvgReps - prevAvgReps) / prevAvgReps) * 100;
        const volumeProgress = ((lastVolume - prevVolume) / prevVolume) * 100;
        
        // Улучшенная логика рекомендаций
        let status, message, recommendation, icon, suggestedWeight;
        
        if (lastAvgReps >= 12 && repsProgress >= 0) {
            const increase = exerciseName.includes('гантел') || exerciseName.includes('блока') ? 2.5 : 5;
            status = 'increase';
            message = 'Отличный прогресс! Вы готовы к увеличению веса';
            recommendation = `Увеличьте вес на ${increase} кг на следующей тренировке`;
            icon = 'arrow-up';
            suggestedWeight = lastMaxWeight + increase;
        } else if (lastAvgReps >= 8 && lastAvgReps < 12) {
            status = 'maintain';
            message = 'Хороший рабочий диапазон';
            recommendation = 'Продолжайте с текущим весом, стремитесь к 12 повторениям';
            icon = 'check';
            suggestedWeight = lastMaxWeight;
        } else if (lastAvgReps < 6 || repsProgress < -20) {
            const decrease = exerciseName.includes('гантел') || exerciseName.includes('блока') ? 2.5 : 5;
            status = 'decrease';
            message = 'Вес слишком большой для правильной техники';
            recommendation = `Уменьшите вес на ${decrease} кг для фокуса на технике`;
            icon = 'arrow-down';
            suggestedWeight = lastMaxWeight - decrease;
        } else if (volumeProgress > 10) {
            status = 'increase-volume';
            message = 'Объем растёт хорошо';
            recommendation = 'Увеличьте количество подходов или повторений';
            icon = 'trend-up';
        } else {
            status = 'maintain';
            message = 'Стабильный прогресс';
            recommendation = 'Продолжайте с текущей программой';
            icon = 'check';
        }
        
        return {
            status,
            message,
            recommendation,
            icon,
            currentMaxWeight: lastMaxWeight,
            suggestedWeight,
            stats: {
                weightProgress: utils.formatNumber(weightProgress),
                repsProgress: utils.formatNumber(repsProgress),
                volumeProgress: utils.formatNumber(volumeProgress)
            }
        };
    }
};

// Модуль графиков
const charts = {
    chart: null,
    
    // Инициализация графика
    init() {
        const ctx = document.getElementById('progress-chart');
        if (!ctx) return;
        
        // Уничтожаем старый график
        if (this.chart) {
            this.chart.destroy();
        }
        
        return ctx;
    },
    
    // Отрисовка графика прогресса
    render(exerciseName, chartType = 'weight', timePeriod = 'all') {
        const ctx = this.init();
        if (!ctx) return;
        
        // Фильтрация тренировок по периоду
        let filteredWorkouts = state.workouts
            .filter(w => w.exercise === exerciseName);
        
        if (timePeriod !== 'all') {
            const now = new Date();
            let cutoffDate;
            
            switch(timePeriod) {
                case 'month':
                    cutoffDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                    break;
                case '3months':
                    cutoffDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
                    break;
                case '6months':
                    cutoffDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
                    break;
            }
            
            filteredWorkouts = filteredWorkouts.filter(w => new Date(w.date) >= cutoffDate);
        }
        
        // Сортировка по дате
        filteredWorkouts.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        if (filteredWorkouts.length === 0) {
            ctx.style.display = 'none';
            return;
        }
        
        ctx.style.display = 'block';
        
        // Подготовка данных
        const labels = filteredWorkouts.map(w => utils.formatDate(w.date, 'short'));
        let data, label, color;
        
        switch(chartType) {
            case 'weight':
                data = filteredWorkouts.map(w => Math.max(...w.sets.map(s => s.weight)));
                label = 'Максимальный вес (кг)';
                color = CONFIG.CHART_COLORS.primary;
                break;
            case 'volume':
                data = filteredWorkouts.map(w => 
                    w.sets.reduce((total, set) => total + (set.weight * set.reps), 0)
                );
                label = 'Общий объём (кг × повторения)';
                color = CONFIG.CHART_COLORS.success;
                break;
            case 'reps':
                data = filteredWorkouts.map(w => 
                    Math.max(...w.sets.map(s => s.reps))
                );
                label = 'Максимальные повторения';
                color = CONFIG.CHART_COLORS.warning;
                break;
            case '1rm':
                data = filteredWorkouts.map(w => {
                    const bestSet = w.sets.reduce((best, set) => {
                        const current1RM = utils.calculate1RM(set.weight, set.reps);
                        return current1RM > best.value ? { value: current1RM, set } : best;
                    }, { value: 0, set: null });
                    return utils.formatNumber(bestSet.value);
                });
                label = 'Расчётный 1ПМ (кг)';
                color = CONFIG.CHART_COLORS.danger;
                break;
        }
        
        // Создание графика
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label,
                    data,
                    borderColor: color,
                    backgroundColor: this.addAlpha(color, 0.1),
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: color,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                },
                plugins: {
                    legend: {
                        labels: {
                            color: getComputedStyle(document.body).getPropertyValue('--color-text'),
                            font: {
                                size: 14
                            }
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: getComputedStyle(document.body).getPropertyValue('--color-surface'),
                        titleColor: getComputedStyle(document.body).getPropertyValue('--color-text'),
                        bodyColor: getComputedStyle(document.body).getPropertyValue('--color-text'),
                        borderColor: getComputedStyle(document.body).getPropertyValue('--color-border'),
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 12,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: getComputedStyle(document.body).getPropertyValue('--color-border')
                        },
                        ticks: {
                            color: getComputedStyle(document.body).getPropertyValue('--color-text-secondary'),
                            maxRotation: 45
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: getComputedStyle(document.body).getPropertyValue('--color-border')
                        },
                        ticks: {
                            color: getComputedStyle(document.body).getPropertyValue('--color-text-secondary')
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'nearest'
                }
            }
        });
    },
    
    // Добавление прозрачности к цвету
    addAlpha(color, alpha) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },
    
    // Экспорт графика
    exportChart() {
        if (!this.chart) return;
        
        const link = document.createElement('a');
        link.download = `liftlog-chart-${new Date().toISOString().split('T')[0]}.png`;
        link.href = this.chart.toBase64Image();
        link.click();
    }
};

// Модуль управления упражнениями
const exercisesManager = {
    // Добавление упражнения
    add(name, type = 'strength', muscleGroup = 'chest') {
        if (!name.trim()) {
            notifications.show('Введите название упражнения', 'warning');
            return false;
        }
        
        // Проверка на дубликаты
        if (state.exercises.some(ex => ex.name.toLowerCase() === name.toLowerCase())) {
            notifications.show('Такое упражнение уже существует', 'warning');
            return false;
        }
        
        const exercise = {
            id: utils.generateId(),
            name: name.trim(),
            type,
            muscleGroup,
            createdAt: new Date().toISOString()
        };
        
        state.exercises.push(exercise);
        store.save();
        
        notifications.show(`Упражнение "${name}" добавлено`, 'success');
        this.updateSelects();
        this.updateList();
        
        return true;
    },
    
    // Удаление упражнения
    remove(id) {
        const exercise = state.exercises.find(ex => ex.id === id);
        if (!exercise) return false;
        
        if (!confirm(`Удалить упражнение "${exercise.name}"? Это также удалит все связанные тренировки.`)) {
            return false;
        }
        
        // Удаляем упражнение
        state.exercises = state.exercises.filter(ex => ex.id !== id);
        
        // Удаляем тренировки с этим упражнением
        state.workouts = state.workouts.filter(w => w.exercise !== exercise.name);
        
        store.save();
        
        notifications.show(`Упражнение "${exercise.name}" удалено`, 'info');
        this.updateSelects();
        this.updateList();
        workoutsManager.updateRecentWorkouts();
        statistics.updateStats();
        
        return true;
    },
    
    // Обновление списков выбора
    updateSelects() {
        const selects = [
            document.getElementById('exercise-select'),
            document.getElementById('progress-exercise-select')
        ];
        
        selects.forEach(select => {
            if (!select) return;
            
            // Сохраняем текущее значение
            const currentValue = select.value;
            
            // Очищаем опции
            while (select.options.length > 1) select.remove(1);
            
            // Добавляем упражнения
            state.exercises.forEach(exercise => {
                const option = document.createElement('option');
                option.value = exercise.id;
                option.textContent = exercise.name;
                select.appendChild(option);
            });
            
            // Восстанавливаем значение
            if (state.exercises.some(ex => ex.id === currentValue)) {
                select.value = currentValue;
            }
        });
    },
    
    // Обновление списка упражнений
    updateList() {
        const container = document.getElementById('exercises-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (state.exercises.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-dumbbell"></i>
                    <p>Упражнений пока нет</p>
                    <button class="btn btn-primary" id="add-exercise-modal-btn">Добавить упражнение</button>
                </div>
            `;
            return;
        }
        
        // Фильтрация по поиску
        const searchInput = document.getElementById('exercise-search');
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        
        const filteredExercises = searchTerm 
            ? state.exercises.filter(ex => ex.name.toLowerCase().includes(searchTerm))
            : state.exercises;
        
        if (filteredExercises.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>Упражнения не найдены</p>
                    <p class="text-muted">Попробуйте другой запрос</p>
                </div>
            `;
            return;
        }
        
        // Отрисовка упражнений
        filteredExercises.forEach(exercise => {
            const div = document.createElement('div');
            div.className = 'exercise-item';
            div.dataset.id = exercise.id;
            
            const typeLabels = {
                strength: 'Силовое',
                hypertrophy: 'Гипертрофия',
                accessory: 'Вспомогательное',
                warmup: 'Разминочное'
            };
            
            const muscleLabels = {
                chest: 'Грудь',
                back: 'Спина',
                legs: 'Ноги',
                shoulders: 'Плечи',
                arms: 'Руки',
                core: 'Пресс'
            };
            
            div.innerHTML = `
                <div>
                    <div class="exercise-name">${exercise.name}</div>
                    <div class="exercise-meta">
                        <span class="exercise-type">${typeLabels[exercise.type] || exercise.type}</span>
                        <span class="exercise-muscle">${muscleLabels[exercise.muscleGroup] || exercise.muscleGroup}</span>
                        <span class="text-muted">${utils.formatDate(exercise.createdAt, 'relative')}</span>
                    </div>
                </div>
                <div class="exercise-actions">
                    <button class="btn-icon edit-exercise" title="Редактировать" data-id="${exercise.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon delete-exercise" title="Удалить" data-id="${exercise.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            container.appendChild(div);
        });
        
        // Добавляем обработчики
        this.addEventListeners();
    },
    
    // Добавление обработчиков событий
    addEventListeners() {
        // Удаление упражнений
        document.querySelectorAll('.delete-exercise').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                this.remove(id);
            });
        });
        
        // Редактирование упражнений
        document.querySelectorAll('.edit-exercise').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                this.edit(id);
            });
        });
    },
    
    // Редактирование упражнения (заглушка для будущей реализации)
    edit(id) {
        const exercise = state.exercises.find(ex => ex.id === id);
        if (exercise) {
            notifications.show('Редактирование упражнений будет добавлено в следующем обновлении', 'info');
        }
    }
};

// Модуль управления тренировками
const workoutsManager = {
    // Добавление тренировки
    add(workoutData) {
        // Валидация
        const errors = utils.validateWorkoutData(workoutData);
        if (errors.length > 0) {
            errors.forEach(error => notifications.show(error, 'warning'));
            return false;
        }
        
        const workout = {
            id: utils.generateId(),
            ...workoutData,
            createdAt: new Date().toISOString()
        };
        
        state.workouts.push(workout);
        store.save();
        
        notifications.show('Тренировка сохранена!', 'success');
        this.clearForm();
        this.updateRecentWorkouts();
        statistics.updateStats();
        
        return true;
    },
    
    // Редактирование тренировки
    edit(id, workoutData) {
        const index = state.workouts.findIndex(w => w.id === id);
        if (index === -1) return false;
        
        const errors = utils.validateWorkoutData(workoutData);
        if (errors.length > 0) {
            errors.forEach(error => notifications.show(error, 'warning'));
            return false;
        }
        
        state.workouts[index] = {
            ...state.workouts[index],
            ...workoutData,
            updatedAt: new Date().toISOString()
        };
        
        store.save();
        
        notifications.show('Тренировка обновлена', 'success');
        this.updateRecentWorkouts();
        statistics.updateStats();
        
        return true;
    },
    
    // Удаление тренировки
    remove(id) {
        const workout = state.workouts.find(w => w.id === id);
        if (!workout) return false;
        
        if (confirm(`Удалить тренировку от ${utils.formatDate(workout.date, 'long')}?`)) {
            state.workouts = state.workouts.filter(w => w.id !== id);
            store.save();
            
            notifications.show('Тренировка удалена', 'info');
            this.updateRecentWorkouts();
            statistics.updateStats();
            
            return true;
        }
        
        return false;
    },
    
    // Очистка формы
    clearForm() {
        const form = document.querySelector('.workout-form');
        if (form) {
            form.reset();
            document.getElementById('sets-list').innerHTML = '';
            document.getElementById('workout-date').value = new Date().toISOString().split('T')[0];
        }
    },
    
    // Обновление списка последних тренировок
    updateRecentWorkouts() {
        const container = document.getElementById('recent-workouts');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (state.workouts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-dumbbell"></i>
                    <p>Тренировок пока нет</p>
                    <button class="btn btn-primary" data-page="workout">Начать первую тренировку</button>
                </div>
            `;
            return;
        }
        
        // Сортируем по дате (новые сначала) и берем последние 5
        const recent = [...state.workouts]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 5);
        
        recent.forEach(workout => {
            const maxWeight = Math.max(...workout.sets.map(s => s.weight));
            const totalVolume = workout.sets.reduce((sum, set) => sum + (set.weight * set.reps), 0);
            const bestSet = workout.sets.reduce((best, set) => 
                (set.weight * set.reps) > (best.weight * best.reps) ? set : best
            , { weight: 0, reps: 0 });
            
            const div = document.createElement('div');
            div.className = 'workout-item';
            div.dataset.id = workout.id;
            
            div.innerHTML = `
                <div>
                    <div class="workout-date">${utils.formatDate(workout.date, 'relative')}</div>
                    <div class="workout-exercise">${workout.exercise}</div>
                    <div class="workout-stats">
                        <span>${workout.sets.length} подхода</span>
                        <span>Макс: ${maxWeight} кг</span>
                        <span>Объём: ${utils.formatNumber(totalVolume)} кг</span>
                    </div>
                </div>
                <div class="workout-actions">
                    <button class="btn-icon view-workout" title="Просмотр" data-id="${workout.id}">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon delete-workout" title="Удалить" data-id="${workout.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            container.appendChild(div);
        });
        
        // Добавляем обработчики
        this.addEventListeners();
    },
    
    // Добавление обработчиков событий
    addEventListeners() {
        // Просмотр тренировок
        document.querySelectorAll('.view-workout').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                this.view(id);
            });
        });
        
        // Удаление тренировок
        document.querySelectorAll('.delete-workout').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                this.remove(id);
            });
        });
    },
    
    // Просмотр деталей тренировки
    view(id) {
        const workout = state.workouts.find(w => w.id === id);
        if (!workout) return;
        
        // Отображение модального окна с деталями тренировки
        const modal = document.getElementById('edit-workout-modal');
        const content = document.getElementById('edit-workout-content');
        
        if (!modal || !content) return;
        
        const exercise = state.exercises.find(ex => ex.name === workout.exercise);
        
        content.innerHTML = `
            <div class="workout-details">
                <div class="detail-header">
                    <h4>${workout.exercise}</h4>
                    <div class="detail-date">${utils.formatDate(workout.date, 'long')}</div>
                </div>
                
                ${workout.notes ? `<div class="detail-notes"><strong>Заметки:</strong> ${workout.notes}</div>` : ''}
                
                <div class="detail-sets">
                    <h5>Подходы:</h5>
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Вес (кг)</th>
                                <th>Повторения</th>
                                <th>Объём</th>
                                <th>1ПМ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${workout.sets.map((set, index) => `
                                <tr>
                                    <td>${index + 1}</td>
                                    <td>${set.weight}</td>
                                    <td>${set.reps}</td>
                                    <td>${utils.formatNumber(set.weight * set.reps)}</td>
                                    <td>${utils.formatNumber(utils.calculate1RM(set.weight, set.reps))}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div class="detail-summary">
                    <div class="summary-item">
                        <span>Максимальный вес:</span>
                        <strong>${Math.max(...workout.sets.map(s => s.weight))} кг</strong>
                    </div>
                    <div class="summary-item">
                        <span>Общий объём:</span>
                        <strong>${utils.formatNumber(workout.sets.reduce((sum, set) => sum + (set.weight * set.reps), 0))} кг</strong>
                    </div>
                    <div class="summary-item">
                        <span>Средний вес:</span>
                        <strong>${utils.formatNumber(workout.sets.reduce((sum, set) => sum + set.weight, 0) / workout.sets.length)} кг</strong>
                    </div>
                </div>
                
                <div class="detail-actions">
                    <button class="btn btn-secondary close-modal">Закрыть</button>
                    <button class="btn btn-danger" id="delete-this-workout" data-id="${workout.id}">Удалить тренировку</button>
                </div>
            </div>
        `;
        
        modal.classList.add('active');
        modal.removeAttribute('hidden');
        
        // Обработчик удаления
        const deleteBtn = document.getElementById('delete-this-workout');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                this.remove(workout.id);
                modal.classList.remove('active');
                modal.setAttribute('hidden', 'true');
            });
        }
    }
};

// Модуль пользовательского интерфейса
const uiManager = {
    // Инициализация интерфейса
    init() {
        this.updateStats();
        this.updateRecentWorkouts();
        this.updateExercisesList();
        exercisesManager.updateSelects();
        this.initDateInput();
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        this.updateThemeIcon();
    },
    
    // Обновление статистики
    updateStats() {
        const stats = statistics.getGeneralStats();
        
        // Основные статистики
        document.getElementById('total-workouts').textContent = stats.totalWorkouts;
        document.getElementById('best-exercise').textContent = stats.bestExercise.name;
        document.getElementById('best-exercise-weight').textContent = stats.bestExercise.weight > 0 ? `${stats.bestExercise.weight} кг` : '';
        document.getElementById('avg-progress').textContent = `${utils.formatNumber(stats.avgProgress)}%`;
        document.getElementById('total-recommendations').textContent = stats.recommendations;
        
        // Прогресс бар
        const progressFill = document.getElementById('progress-fill');
        if (progressFill) {
            progressFill.style.width = `${Math.min(stats.avgProgress, 100)}%`;
        }
        
        // Быстрая статистика
        document.getElementById('total-tonnage').textContent = `${utils.formatNumber(stats.totalVolume)} кг`;
        document.getElementById('avg-volume').textContent = `${utils.formatNumber(stats.avgVolume)} кг`;
        document.getElementById('workouts-per-week').textContent = utils.formatNumber(stats.workoutsPerWeek, 1);
        document.getElementById('month-progress').textContent = `${stats.monthProgress >= 0 ? '+' : ''}${utils.formatNumber(stats.monthProgress)}%`;
    },
    
    // Обновление списка тренировок
    updateRecentWorkouts() {
        workoutsManager.updateRecentWorkouts();
    },
    
    // Обновление списка упражнений
    updateExercisesList() {
        exercisesManager.updateList();
    },
    
    // Инициализация поля даты
    initDateInput() {
        const dateInput = document.getElementById('workout-date');
        if (dateInput) {
            const today = new Date().toISOString().split('T')[0];
            dateInput.value = today;
            dateInput.max = today;
        }
    },
    
    // Обновление иконки темы
    updateThemeIcon() {
        const icon = document.querySelector('#theme-toggle i');
        if (icon) {
            icon.className = state.theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        }
    },
    
    // Настройка обработчиков событий
    setupEventListeners() {
        // Навигация
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const page = e.currentTarget.dataset.page;
                this.showPage(page);
            });
        });
        
        // Переключение темы
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                store.toggleTheme();
                charts.init(); // Переинициализируем графики для новой темы
            });
        }
        
        // Экспорт данных
        const exportBtn = document.getElementById('export-data');
        if (exportBtn) {
            exportBtn.addEventListener('click', utils.exportData);
        }
        
        // Импорт данных
        const importInput = document.createElement('input');
        importInput.type = 'file';
        importInput.accept = '.json';
        importInput.style.display = 'none';
        importInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    await utils.importData(file);
                    notifications.show('Данные успешно импортированы', 'success');
                    this.init(); // Перезагружаем интерфейс
                } catch (error) {
                    notifications.show(`Ошибка импорта: ${error.message}`, 'danger');
                }
            }
        });
        document.body.appendChild(importInput);
        
        // Скрытый триггер для импорта
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'i' && e.shiftKey) {
                e.preventDefault();
                importInput.click();
            }
        });
        
        // Поиск упражнений
        const searchInput = document.getElementById('exercise-search');
        if (searchInput) {
            searchInput.addEventListener('input', utils.debounce(() => {
                exercisesManager.updateList();
            }, CONFIG.DEBOUNCE_DELAY));
        }
        
        // Добавление подходов
        const addSetBtn = document.getElementById('add-set-btn');
        if (addSetBtn) {
            addSetBtn.addEventListener('click', () => {
                this.addSet();
            });
        }
        
        // Очистка подходов
        const clearSetsBtn = document.getElementById('clear-sets-btn');
        if (clearSetsBtn) {
            clearSetsBtn.addEventListener('click', () => {
                document.getElementById('sets-list').innerHTML = '';
                this.updateSetCalculations();
            });
        }
        
        // Сохранение тренировки
        const saveWorkoutBtn = document.getElementById('save-workout-btn');
        if (saveWorkoutBtn) {
            saveWorkoutBtn.addEventListener('click', () => {
                this.saveWorkout();
            });
        }
        
        // Отмена тренировки
        const cancelBtn = document.getElementById('cancel-workout-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.showPage('dashboard');
                workoutsManager.clearForm();
            });
        }
        
        // Модальное окно упражнений
        const addExerciseModalBtn = document.getElementById('add-exercise-modal-btn');
        if (addExerciseModalBtn) {
            addExerciseModalBtn.addEventListener('click', () => {
                this.showModal('add-exercise-modal');
            });
        }
        
        // Кнопка добавления упражнения в форме
        const addExerciseBtn = document.getElementById('add-exercise-btn');
        if (addExerciseBtn) {
            addExerciseBtn.addEventListener('click', () => {
                this.showModal('add-exercise-modal');
            });
        }
        
        // Закрытие модальных окон
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                this.hideModals();
            });
        });
        
        // Клик по оверлею модальных окон
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', () => {
                this.hideModals();
            });
        });
        
        // Сохранение упражнения
        const saveExerciseBtn = document.getElementById('save-exercise-btn');
        if (saveExerciseBtn) {
            saveExerciseBtn.addEventListener('click', () => {
                const name = document.getElementById('new-exercise-name').value;
                const type = document.getElementById('new-exercise-type').value;
                const muscleGroup = document.getElementById('new-exercise-muscle').value;
                
                if (exercisesManager.add(name, type, muscleGroup)) {
                    this.hideModals();
                }
            });
        }
        
        // Enter в поле названия упражнения
        const exerciseNameInput = document.getElementById('new-exercise-name');
        if (exerciseNameInput) {
            exerciseNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    document.getElementById('save-exercise-btn').click();
                }
            });
        }
        
        // Выбор упражнения для прогресса
        const progressSelect = document.getElementById('progress-exercise-select');
        if (progressSelect) {
            progressSelect.addEventListener('change', () => {
                const exerciseId = progressSelect.value;
                if (exerciseId) {
                    const exercise = state.exercises.find(ex => ex.id === exerciseId);
                    if (exercise) {
                        const chartType = document.getElementById('chart-type').value;
                        const timePeriod = document.getElementById('time-period').value;
                        charts.render(exercise.name, chartType, timePeriod);
                        this.updateRecommendations(exercise.name);
                        this.updateExerciseStats(exercise.name);
                    }
                }
            });
        }
        
        // Изменение типа графика
        const chartTypeSelect = document.getElementById('chart-type');
        if (chartTypeSelect) {
            chartTypeSelect.addEventListener('change', () => {
                const exerciseId = document.getElementById('progress-exercise-select').value;
                if (exerciseId) {
                    const exercise = state.exercises.find(ex => ex.id === exerciseId);
                    if (exercise) {
                        const timePeriod = document.getElementById('time-period').value;
                        charts.render(exercise.name, chartTypeSelect.value, timePeriod);
                    }
                }
            });
        }
        
        // Изменение периода графика
        const timePeriodSelect = document.getElementById('time-period');
        if (timePeriodSelect) {
            timePeriodSelect.addEventListener('change', () => {
                const exerciseId = document.getElementById('progress-exercise-select').value;
                if (exerciseId) {
                    const exercise = state.exercises.find(ex => ex.id === exerciseId);
                    if (exercise) {
                        const chartType = document.getElementById('chart-type').value;
                        charts.render(exercise.name, chartType, timePeriodSelect.value);
                    }
                }
            });
        }
        
        // Экспорт графика
        const exportChartBtn = document.getElementById('export-chart');
        if (exportChartBtn) {
            exportChartBtn.addEventListener('click', () => {
                charts.exportChart();
            });
        }
        
        // Обновление расчетов при изменении подходов
        document.addEventListener('input', utils.debounce((e) => {
            if (e.target.classList.contains('set-weight') || e.target.classList.contains('set-reps')) {
                this.updateSetCalculations();
            }
        }, CONFIG.DEBOUNCE_DELAY));
        
        // Просмотр всех тренировок
        const viewAllBtn = document.getElementById('view-all-workouts');
        if (viewAllBtn) {
            viewAllBtn.addEventListener('click', () => {
                this.showPage('progress');
            });
        }
    },
    
    // Настройка горячих клавиш
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Пропускаем, если фокус в поле ввода
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                return;
            }
            
            switch(e.key) {
                case '1':
                    e.preventDefault();
                    this.showPage('dashboard');
                    break;
                case '2':
                    e.preventDefault();
                    this.showPage('workout');
                    break;
                case '3':
                    e.preventDefault();
                    this.showPage('exercises');
                    break;
                case '4':
                    e.preventDefault();
                    this.showPage('progress');
                    break;
                case 't':
                case 'T':
                    if (e.ctrlKey) {
                        e.preventDefault();
                        store.toggleTheme();
                    }
                    break;
                case 'Escape':
                    this.hideModals();
                    break;
                case '+':
                    if (e.ctrlKey && document.getElementById('workout-page').classList.contains('active')) {
                        e.preventDefault();
                        this.addSet();
                    }
                    break;
            }
        });
        
        // Показываем подсказку для клавиатуры
        const keyboardHint = document.getElementById('keyboard-hint');
        if (keyboardHint) {
            setTimeout(() => {
                keyboardHint.classList.add('show');
                setTimeout(() => keyboardHint.classList.remove('show'), 5000);
            }, 3000);
        }
    },
    
    // Показать страницу
    showPage(pageName) {
        // Скрываем все страницы
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
            page.setAttribute('hidden', 'true');
        });
        
        // Убираем активный класс со всех кнопок
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Показываем нужную страницу
        const page = document.getElementById(`${pageName}-page`);
        if (page) {
            page.classList.add('active');
            page.removeAttribute('hidden');
        }
        
        // Активируем нужную кнопку
        const btn = document.querySelector(`.nav-btn[data-page="${pageName}"]`);
        if (btn) {
            btn.classList.add('active');
        }
        
        // Обновляем данные на странице
        switch(pageName) {
            case 'dashboard':
                this.updateStats();
                this.updateRecentWorkouts();
                break;
            case 'exercises':
                this.updateExercisesList();
                break;
            case 'progress':
                exercisesManager.updateSelects();
                break;
        }
        
        // Прокручиваем наверх
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    
    // Показать модальное окно
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            modal.removeAttribute('hidden');
            
            // Фокус на первом поле ввода
            const input = modal.querySelector('input');
            if (input) input.focus();
        }
    },
    
    // Скрыть все модальные окна
    hideModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
            modal.setAttribute('hidden', 'true');
        });
        
        // Очищаем поля формы добавления упражнения
        document.getElementById('new-exercise-name').value = '';
    },
    
    // Добавление подхода
    addSet() {
        const setsList = document.getElementById('sets-list');
        if (!setsList) return;
        
        // Проверяем максимальное количество подходов
        const currentSets = setsList.querySelectorAll('.set-row:not(.template)').length;
        if (currentSets >= CONFIG.MAX_SETS) {
            notifications.show(`Максимальное количество подходов: ${CONFIG.MAX_SETS}`, 'warning');
            return;
        }
        
        const template = setsList.querySelector('.set-row.template');
        const newSet = template.cloneNode(true);
        
        newSet.classList.remove('template');
        newSet.removeAttribute('hidden');
        
        const setNumber = currentSets + 1;
        newSet.querySelector('.set-number').textContent = setNumber;
        
        // Очищаем поля
        newSet.querySelector('.set-weight').value = '';
        newSet.querySelector('.set-reps').value = '';
        
        // Устанавливаем атрибуты доступности
        newSet.querySelector('.set-weight').setAttribute('aria-label', `Вес для подхода ${setNumber}`);
        newSet.querySelector('.set-reps').setAttribute('aria-label', `Количество повторений для подхода ${setNumber}`);
        newSet.querySelector('.delete-set').setAttribute('aria-label', `Удалить подход ${setNumber}`);
        
        setsList.appendChild(newSet);
        
        // Добавляем обработчик удаления
        newSet.querySelector('.delete-set').addEventListener('click', (e) => {
            const setRow = e.target.closest('.set-row');
            setRow.classList.add('removing');
            setTimeout(() => {
                setRow.remove();
                this.updateSetNumbers();
                this.updateSetCalculations();
            }, 300);
        });
        
        this.updateSetCalculations();
    },
    
    // Обновление номеров подходов
    updateSetNumbers() {
        const sets = document.querySelectorAll('#sets-list .set-row:not(.template)');
        sets.forEach((set, index) => {
            set.querySelector('.set-number').textContent = index + 1;
            
            // Обновляем ARIA-лейблы
            set.querySelector('.set-weight').setAttribute('aria-label', `Вес для подхода ${index + 1}`);
            set.querySelector('.set-reps').setAttribute('aria-label', `Количество повторений для подхода ${index + 1}`);
            set.querySelector('.delete-set').setAttribute('aria-label', `Удалить подход ${index + 1}`);
        });
    },
    
    // Обновление расчетов подходов
    updateSetCalculations() {
        const sets = document.querySelectorAll('#sets-list .set-row:not(.template)');
        let totalVolume = 0;
        let estimated1RM = 0;
        
        sets.forEach(set => {
            const weight = parseFloat(set.querySelector('.set-weight').value) || 0;
            const reps = parseInt(set.querySelector('.set-reps').value) || 0;
            
            totalVolume += weight * reps;
            
            if (weight > 0 && reps > 0) {
                const current1RM = utils.calculate1RM(weight, reps);
                estimated1RM = Math.max(estimated1RM, current1RM);
            }
        });
        
        document.getElementById('total-volume').textContent = `${utils.formatNumber(totalVolume)} кг`;
        document.getElementById('estimated-1rm').textContent = `${utils.formatNumber(estimated1RM)} кг`;
    },
    
    // Сохранение тренировки
    saveWorkout() {
        const dateInput = document.getElementById('workout-date');
        const exerciseSelect = document.getElementById('exercise-select');
        const notesInput = document.getElementById('workout-notes');
        const setsContainer = document.getElementById('sets-list');
        
        const date = dateInput.value;
        const exerciseId = exerciseSelect.value;
        const notes = notesInput.value;
        
        // Находим упражнение по ID
        const exercise = state.exercises.find(ex => ex.id === exerciseId);
        if (!exercise) {
            notifications.show('Выберите упражнение', 'warning');
            return;
        }
        
        // Собираем данные подходов
        const sets = [];
        const setRows = setsContainer.querySelectorAll('.set-row:not(.template)');
        
        setRows.forEach(row => {
            const weight = parseFloat(row.querySelector('.set-weight').value);
            const reps = parseInt(row.querySelector('.set-reps').value);
            
            if (weight > 0 && reps > 0) {
                sets.push({
                    weight: weight,
                    reps: reps,
                    completed: true
                });
            }
        });
        
        const workoutData = {
            date,
            exercise: exercise.name,
            sets,
            notes
        };
        
        if (workoutsManager.add(workoutData)) {
            this.showPage('dashboard');
        }
    },
    
    // Обновление рекомендаций
    updateRecommendations(exerciseName) {
        const container = document.getElementById('recommendations');
        if (!container || !exerciseName) return;
        
        const progression = statistics.calculateProgression(exerciseName);
        
        const icons = {
            'increase': 'fas fa-arrow-up',
            'decrease': 'fas fa-arrow-down',
            'maintain': 'fas fa-check',
            'increase-volume': 'fas fa-chart-line',
            'not-enough-data': 'fas fa-info-circle'
        };
        
        const statusClasses = {
            'increase': 'success',
            'decrease': 'danger',
            'maintain': 'info',
            'increase-volume': 'warning',
            'not-enough-data': 'info'
        };
        
        container.innerHTML = `
            <div class="recommendation-item ${statusClasses[progression.status]}">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <i class="${icons[progression.status]}" style="font-size: 1.5rem;"></i>
                    <strong>${progression.message}</strong>
                </div>
                <p>${progression.recommendation}</p>
                ${progression.currentMaxWeight ? 
                    `<p><strong>Текущий максимум:</strong> ${progression.currentMaxWeight} кг</p>` : ''}
                ${progression.suggestedWeight ? 
                    `<p><strong>Предлагаемый вес:</strong> ${progression.suggestedWeight} кг</p>` : ''}
                ${progression.stats ? `
                    <div class="progress-stats">
                        <p><strong>Статистика прогресса:</strong></p>
                        <ul>
                            <li>Прогресс веса: ${progression.stats.weightProgress}%</li>
                            <li>Прогресс повторений: ${progression.stats.repsProgress}%</li>
                            <li>Прогресс объема: ${progression.stats.volumeProgress}%</li>
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
    },
    
    // Обновление статистики упражнения
    updateExerciseStats(exerciseName) {
        const container = document.getElementById('exercise-stats');
        if (!container || !exerciseName) return;
        
        const exerciseWorkouts = state.workouts.filter(w => w.exercise === exerciseName);
        const totalWorkouts = exerciseWorkouts.length;
        
        if (totalWorkouts === 0) {
            container.innerHTML = '<p class="empty-state">Нет данных для этого упражнения</p>';
            return;
        }
        
        // Максимальный вес
        let maxWeight = 0;
        // Средний объем
        let totalVolume = 0;
        // Прогресс за месяц
        let monthProgress = 0;
        
        exerciseWorkouts.forEach(workout => {
            const workoutMax = Math.max(...workout.sets.map(s => s.weight));
            maxWeight = Math.max(maxWeight, workoutMax);
            
            const workoutVolume = workout.sets.reduce((sum, set) => sum + (set.weight * set.reps), 0);
            totalVolume += workoutVolume;
        });
        
        const avgVolume = totalVolume / totalWorkouts;
        
        // Расчет месячного прогресса
        const now = new Date();
        const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        const recentWorkouts = exerciseWorkouts
            .filter(w => new Date(w.date) >= monthAgo)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        
        if (recentWorkouts.length >= 2) {
            const first = recentWorkouts[0];
            const last = recentWorkouts[recentWorkouts.length - 1];
            
            const firstMax = Math.max(...first.sets.map(s => s.weight));
            const lastMax = Math.max(...last.sets.map(s => s.weight));
            
            monthProgress = ((lastMax - firstMax) / firstMax) * 100;
        }
        
        container.innerHTML = `
            <div class="stat-item">
                <span>Всего тренировок:</span>
                <strong>${totalWorkouts}</strong>
            </div>
            <div class="stat-item">
                <span>Максимальный вес:</span>
                <strong>${utils.formatNumber(maxWeight)} кг</strong>
            </div>
            <div class="stat-item">
                <span>Средний объём:</span>
                <strong>${utils.formatNumber(avgVolume)} кг</strong>
            </div>
            <div class="stat-item">
                <span>Прогресс за месяц:</span>
                <strong class="${monthProgress >= 0 ? 'positive' : 'negative'}">
                    ${monthProgress >= 0 ? '+' : ''}${utils.formatNumber(monthProgress)}%
                </strong>
            </div>
        `;
    }
};

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    // Загружаем состояние
    store.load();
    
    // Инициализируем интерфейс
    uiManager.init();
    
    // Показываем приветственное сообщение
    setTimeout(() => {
        if (state.workouts.length === 0) {
            notifications.show('Добро пожаловать в LiftLog! Начните с добавления первой тренировки.', 'info', 5000);
        }
    }, 1000);
    
    // Экспортируем для отладки
    window.LiftLog = {
        state,
        store,
        utils,
        statistics,
        charts,
        exercisesManager,
        workoutsManager,
        uiManager
    };
    
    console.log(`${CONFIG.APP_NAME} v${CONFIG.VERSION} готов к работе!`);
});

// Обработчик перед закрытием страницы
window.addEventListener('beforeunload', (e) => {
    if (state.lastSaved) {
        const unsavedChanges = false; // Можно добавить логику проверки изменений
        if (unsavedChanges) {
            e.preventDefault();
            e.returnValue = 'У вас есть несохраненные изменения. Вы уверены, что хотите уйти?';
        }
    }
});