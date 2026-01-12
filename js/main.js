// ==========================================================================
// ДОМУРОВАННЫЕ ЭЛЕМЕНТЫ
// ==========================================================================
const body = document.body;
const themeToggle = document.getElementById('themeToggle');
const menuToggle = document.getElementById('menuToggle');
const navList = document.getElementById('navList');
const backToTop = document.getElementById('backToTop');
const currentYear = document.getElementById('currentYear');
const navLinks = document.querySelectorAll('.nav-link');

// ==========================================================================
// ПЕРЕКЛЮЧЕНИЕ ТЕМЫ (СВЕТЛАЯ/ТЕМНАЯ)
// ==========================================================================
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme) {
        body.classList.add(savedTheme + '-theme');
        body.classList.remove(savedTheme === 'dark' ? 'light-theme' : 'dark-theme');
    } else if (systemPrefersDark) {
        body.classList.add('dark-theme');
        body.classList.remove('light-theme');
    }
    
    if (!body.classList.contains('light-theme') && !body.classList.contains('dark-theme')) {
        body.classList.add('light-theme');
    }
}

function toggleTheme() {
    if (body.classList.contains('light-theme')) {
        body.classList.replace('light-theme', 'dark-theme');
        localStorage.setItem('theme', 'dark');
    } else {
        body.classList.replace('dark-theme', 'light-theme');
        localStorage.setItem('theme', 'light');
    }
}

// ==========================================================================
// МОБИЛЬНОЕ МЕНЮ
// ==========================================================================
function toggleMenu() {
    menuToggle.classList.toggle('active');
    navList.classList.toggle('active');
    body.style.overflow = navList.classList.contains('active') ? 'hidden' : '';
}

// ==========================================================================
// ПЛАВНАЯ ПРОКРУТКА
// ==========================================================================
function initSmoothScroll() {
    const links = document.querySelectorAll('a[href^="#"]');
    
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            if (href === '#') return;
            
            e.preventDefault();
            const targetElement = document.querySelector(href);
            
            if (targetElement) {
                // Закрываем меню на мобильных
                if (navList.classList.contains('active')) {
                    toggleMenu();
                }
                
                window.scrollTo({
                    top: targetElement.offsetTop - 80,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// ==========================================================================
// КНОПКА "НАВЕРХ"
// ==========================================================================
function initBackToTop() {
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            backToTop.style.opacity = '1';
            backToTop.style.visibility = 'visible';
        } else {
            backToTop.style.opacity = '0';
            backToTop.style.visibility = 'hidden';
        }
    });
    
    backToTop.addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

// ==========================================================================
// АНИМАЦИИ ПРИ СКРОЛЛЕ (ТОЛЬКО ДЛЯ РАЗРЕШЕННЫХ ЭЛЕМЕНТОВ)
// ==========================================================================
function initScrollAnimations() {
    // Только элементы с классом animate-on-scroll
    const animatedElements = document.querySelectorAll('.animate-on-scroll');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animated');
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });
    
    animatedElements.forEach(el => observer.observe(el));
}

// ==========================================================================
// ОБНОВЛЕНИЕ ГОДА В ФУТЕРЕ
// ==========================================================================
function updateCurrentYear() {
    currentYear.textContent = new Date().getFullYear();
}

// ==========================================================================
// ПРЕДЗАГРУЗКА ИЗОБРАЖЕНИЙ (ДЛЯ ПЛАВНОЙ ЗАГРУЗКИ)
// ==========================================================================
function preloadImages() {
    const images = [
        'images/avatar.jpg',
        'images/project-web.jpg',
        'images/project-brand.jpg',
        'images/project-3d.jpg'
    ];
    
    images.forEach(src => {
        const img = new Image();
        img.src = src;
    });
}

// ==========================================================================
// ИНИЦИАЛИЗАЦИЯ ВСЕГО
// ==========================================================================
function init() {
    initTheme();
    initSmoothScroll();
    initBackToTop();
    initScrollAnimations();
    updateCurrentYear();
    preloadImages();
    
    // События
    themeToggle.addEventListener('click', toggleTheme);
    menuToggle.addEventListener('click', toggleMenu);
    
    // Закрытие меню при клике на ссылку
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (navList.classList.contains('active')) {
                toggleMenu();
            }
        });
    });
    
    // Закрытие меню при клике вне его
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.nav') && navList.classList.contains('active')) {
            toggleMenu();
        }
    });
}

// Запускаем при полной загрузке DOM
document.addEventListener('DOMContentLoaded', init);