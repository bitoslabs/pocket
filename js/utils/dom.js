/**
 * DOM Utilities
 * Helper functions for DOM manipulation
 * 
 * @module utils/dom
 */

/**
 * Create an element with attributes and children
 * @param {string} tag - Element tag name
 * @param {Object} attrs - Attributes object
 * @param {...(HTMLElement|string)} children - Child elements or text
 * @returns {HTMLElement}
 */
export function createElement(tag, attrs = {}, ...children) {
    const element = document.createElement(tag);

    // Set attributes
    Object.entries(attrs).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'dataset') {
            Object.entries(value).forEach(([dataKey, dataValue]) => {
                element.dataset[dataKey] = dataValue;
            });
        } else if (key.startsWith('on') && typeof value === 'function') {
            const event = key.slice(2).toLowerCase();
            element.addEventListener(event, value);
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(element.style, value);
        } else if (value !== undefined && value !== null && value !== false) {
            element.setAttribute(key, value);
        }
    });

    // Append children
    children.forEach(child => {
        if (child === null || child === undefined) return;
        if (typeof child === 'string' || typeof child === 'number') {
            element.appendChild(document.createTextNode(String(child)));
        } else if (child instanceof Node) {
            element.appendChild(child);
        } else if (Array.isArray(child)) {
            child.forEach(c => {
                if (c instanceof Node) element.appendChild(c);
            });
        }
    });

    return element;
}

/**
 * Shorthand element creators
 */
export const el = {
    div: (attrs, ...children) => createElement('div', attrs, ...children),
    span: (attrs, ...children) => createElement('span', attrs, ...children),
    p: (attrs, ...children) => createElement('p', attrs, ...children),
    a: (attrs, ...children) => createElement('a', attrs, ...children),
    button: (attrs, ...children) => createElement('button', attrs, ...children),
    input: (attrs) => createElement('input', attrs),
    label: (attrs, ...children) => createElement('label', attrs, ...children),
    h1: (attrs, ...children) => createElement('h1', attrs, ...children),
    h2: (attrs, ...children) => createElement('h2', attrs, ...children),
    h3: (attrs, ...children) => createElement('h3', attrs, ...children),
    ul: (attrs, ...children) => createElement('ul', attrs, ...children),
    li: (attrs, ...children) => createElement('li', attrs, ...children),
    img: (attrs) => createElement('img', attrs),
    svg: (attrs, ...children) => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        Object.entries(attrs).forEach(([key, value]) => {
            svg.setAttribute(key, value);
        });
        children.forEach(child => {
            if (child instanceof Node) svg.appendChild(child);
        });
        return svg;
    }
};

/**
 * Query selector shorthand
 * @param {string} selector - CSS selector
 * @param {HTMLElement} [context=document] - Context element
 * @returns {HTMLElement|null}
 */
export function $(selector, context = document) {
    return context.querySelector(selector);
}

/**
 * Query selector all shorthand
 * @param {string} selector - CSS selector
 * @param {HTMLElement} [context=document] - Context element
 * @returns {HTMLElement[]}
 */
export function $$(selector, context = document) {
    return Array.from(context.querySelectorAll(selector));
}

/**
 * Add event listener with delegation
 * @param {HTMLElement} element - Container element
 * @param {string} event - Event type
 * @param {string} selector - Delegate selector
 * @param {Function} handler - Event handler
 */
export function delegate(element, event, selector, handler) {
    element.addEventListener(event, (e) => {
        const target = e.target.closest(selector);
        if (target && element.contains(target)) {
            handler.call(target, e, target);
        }
    });
}

/**
 * Show element
 * @param {HTMLElement} element
 */
export function show(element) {
    if (element) element.style.display = '';
}

/**
 * Hide element
 * @param {HTMLElement} element
 */
export function hide(element) {
    if (element) element.style.display = 'none';
}

/**
 * Toggle element visibility
 * @param {HTMLElement} element
 * @param {boolean} [force]
 */
export function toggle(element, force) {
    if (!element) return;

    if (force !== undefined) {
        element.style.display = force ? '' : 'none';
    } else {
        element.style.display = element.style.display === 'none' ? '' : 'none';
    }
}

/**
 * Add class(es) to element
 * @param {HTMLElement} element
 * @param {...string} classes
 */
export function addClass(element, ...classes) {
    if (element) element.classList.add(...classes);
}

/**
 * Remove class(es) from element
 * @param {HTMLElement} element
 * @param {...string} classes
 */
export function removeClass(element, ...classes) {
    if (element) element.classList.remove(...classes);
}

/**
 * Toggle class on element
 * @param {HTMLElement} element
 * @param {string} className
 * @param {boolean} [force]
 */
export function toggleClass(element, className, force) {
    if (element) element.classList.toggle(className, force);
}

/**
 * Check if element has class
 * @param {HTMLElement} element
 * @param {string} className
 * @returns {boolean}
 */
export function hasClass(element, className) {
    return element?.classList.contains(className) ?? false;
}

/**
 * Set multiple attributes on element
 * @param {HTMLElement} element
 * @param {Object} attrs
 */
export function setAttrs(element, attrs) {
    if (!element) return;
    Object.entries(attrs).forEach(([key, value]) => {
        element.setAttribute(key, value);
    });
}

/**
 * Empty an element
 * @param {HTMLElement} element
 */
export function empty(element) {
    if (element) element.innerHTML = '';
}

/**
 * Animate element
 * @param {HTMLElement} element
 * @param {Object} keyframes
 * @param {Object} options
 * @returns {Animation}
 */
export function animate(element, keyframes, options = {}) {
    const defaults = {
        duration: 300,
        easing: 'ease',
        fill: 'forwards'
    };
    return element?.animate(keyframes, { ...defaults, ...options });
}

/**
 * Fade in element
 * @param {HTMLElement} element
 * @param {number} duration
 */
export function fadeIn(element, duration = 300) {
    if (!element) return;
    element.style.display = '';
    animate(element, [
        { opacity: 0 },
        { opacity: 1 }
    ], { duration });
}

/**
 * Fade out element
 * @param {HTMLElement} element
 * @param {number} duration
 */
export function fadeOut(element, duration = 300) {
    if (!element) return;
    const animation = animate(element, [
        { opacity: 1 },
        { opacity: 0 }
    ], { duration });
    animation.onfinish = () => {
        element.style.display = 'none';
    };
}

export default {
    createElement,
    el,
    $,
    $$,
    delegate,
    show,
    hide,
    toggle,
    addClass,
    removeClass,
    toggleClass,
    hasClass,
    setAttrs,
    empty,
    animate,
    fadeIn,
    fadeOut
};
