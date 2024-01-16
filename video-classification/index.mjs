function noop() { }
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
let src_url_equal_anchor;
function src_url_equal(element_src, url) {
    if (!src_url_equal_anchor) {
        src_url_equal_anchor = document.createElement('a');
    }
    src_url_equal_anchor.href = url;
    return element_src === src_url_equal_anchor.href;
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}

// Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
// at the end of hydration without touching the remaining nodes.
let is_hydrating = false;
function start_hydrating() {
    is_hydrating = true;
}
function end_hydrating() {
    is_hydrating = false;
}
function upper_bound(low, high, key, value) {
    // Return first index of value larger than input value in the range [low, high)
    while (low < high) {
        const mid = low + ((high - low) >> 1);
        if (key(mid) <= value) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
}
function init_hydrate(target) {
    if (target.hydrate_init)
        return;
    target.hydrate_init = true;
    // We know that all children have claim_order values since the unclaimed have been detached if target is not <head>
    let children = target.childNodes;
    // If target is <head>, there may be children without claim_order
    if (target.nodeName === 'HEAD') {
        const myChildren = [];
        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            if (node.claim_order !== undefined) {
                myChildren.push(node);
            }
        }
        children = myChildren;
    }
    /*
    * Reorder claimed children optimally.
    * We can reorder claimed children optimally by finding the longest subsequence of
    * nodes that are already claimed in order and only moving the rest. The longest
    * subsequence of nodes that are claimed in order can be found by
    * computing the longest increasing subsequence of .claim_order values.
    *
    * This algorithm is optimal in generating the least amount of reorder operations
    * possible.
    *
    * Proof:
    * We know that, given a set of reordering operations, the nodes that do not move
    * always form an increasing subsequence, since they do not move among each other
    * meaning that they must be already ordered among each other. Thus, the maximal
    * set of nodes that do not move form a longest increasing subsequence.
    */
    // Compute longest increasing subsequence
    // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
    const m = new Int32Array(children.length + 1);
    // Predecessor indices + 1
    const p = new Int32Array(children.length);
    m[0] = -1;
    let longest = 0;
    for (let i = 0; i < children.length; i++) {
        const current = children[i].claim_order;
        // Find the largest subsequence length such that it ends in a value less than our current value
        // upper_bound returns first greater value, so we subtract one
        // with fast path for when we are on the current longest subsequence
        const seqLen = ((longest > 0 && children[m[longest]].claim_order <= current) ? longest + 1 : upper_bound(1, longest, idx => children[m[idx]].claim_order, current)) - 1;
        p[i] = m[seqLen] + 1;
        const newLen = seqLen + 1;
        // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
        m[newLen] = i;
        longest = Math.max(newLen, longest);
    }
    // The longest increasing subsequence of nodes (initially reversed)
    const lis = [];
    // The rest of the nodes, nodes that will be moved
    const toMove = [];
    let last = children.length - 1;
    for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
        lis.push(children[cur - 1]);
        for (; last >= cur; last--) {
            toMove.push(children[last]);
        }
        last--;
    }
    for (; last >= 0; last--) {
        toMove.push(children[last]);
    }
    lis.reverse();
    // We sort the nodes being moved to guarantee that their insertion order matches the claim order
    toMove.sort((a, b) => a.claim_order - b.claim_order);
    // Finally, we move the nodes
    for (let i = 0, j = 0; i < toMove.length; i++) {
        while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
            j++;
        }
        const anchor = j < lis.length ? lis[j] : null;
        target.insertBefore(toMove[i], anchor);
    }
}
function append(target, node) {
    target.appendChild(node);
}
function append_styles(target, style_sheet_id, styles) {
    const append_styles_to = get_root_for_style(target);
    if (!append_styles_to.getElementById(style_sheet_id)) {
        const style = element('style');
        style.id = style_sheet_id;
        style.textContent = styles;
        append_stylesheet(append_styles_to, style);
    }
}
function get_root_for_style(node) {
    if (!node)
        return document;
    const root = node.getRootNode ? node.getRootNode() : node.ownerDocument;
    if (root && root.host) {
        return root;
    }
    return node.ownerDocument;
}
function append_stylesheet(node, style) {
    append(node.head || node, style);
    return style.sheet;
}
function append_hydration(target, node) {
    if (is_hydrating) {
        init_hydrate(target);
        if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentNode !== target))) {
            target.actual_end_child = target.firstChild;
        }
        // Skip nodes of undefined ordering
        while ((target.actual_end_child !== null) && (target.actual_end_child.claim_order === undefined)) {
            target.actual_end_child = target.actual_end_child.nextSibling;
        }
        if (node !== target.actual_end_child) {
            // We only insert if the ordering of this node should be modified or the parent node is not target
            if (node.claim_order !== undefined || node.parentNode !== target) {
                target.insertBefore(node, target.actual_end_child);
            }
        }
        else {
            target.actual_end_child = node.nextSibling;
        }
    }
    else if (node.parentNode !== target || node.nextSibling !== null) {
        target.appendChild(node);
    }
}
function insert_hydration(target, node, anchor) {
    if (is_hydrating && !anchor) {
        append_hydration(target, node);
    }
    else if (node.parentNode !== target || node.nextSibling != anchor) {
        target.insertBefore(node, anchor || null);
    }
}
function detach(node) {
    if (node.parentNode) {
        node.parentNode.removeChild(node);
    }
}
function element(name) {
    return document.createElement(name);
}
function svg_element(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function children(element) {
    return Array.from(element.childNodes);
}
function init_claim_info(nodes) {
    if (nodes.claim_info === undefined) {
        nodes.claim_info = { last_index: 0, total_claimed: 0 };
    }
}
function claim_node(nodes, predicate, processNode, createNode, dontUpdateLastIndex = false) {
    // Try to find nodes in an order such that we lengthen the longest increasing subsequence
    init_claim_info(nodes);
    const resultNode = (() => {
        // We first try to find an element after the previous one
        for (let i = nodes.claim_info.last_index; i < nodes.length; i++) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                return node;
            }
        }
        // Otherwise, we try to find one before
        // We iterate in reverse so that we don't go too far back
        for (let i = nodes.claim_info.last_index - 1; i >= 0; i--) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                else if (replacement === undefined) {
                    // Since we spliced before the last_index, we decrease it
                    nodes.claim_info.last_index--;
                }
                return node;
            }
        }
        // If we can't find any matching node, we create a new one
        return createNode();
    })();
    resultNode.claim_order = nodes.claim_info.total_claimed;
    nodes.claim_info.total_claimed += 1;
    return resultNode;
}
function claim_element_base(nodes, name, attributes, create_element) {
    return claim_node(nodes, (node) => node.nodeName === name, (node) => {
        const remove = [];
        for (let j = 0; j < node.attributes.length; j++) {
            const attribute = node.attributes[j];
            if (!attributes[attribute.name]) {
                remove.push(attribute.name);
            }
        }
        remove.forEach(v => node.removeAttribute(v));
        return undefined;
    }, () => create_element(name));
}
function claim_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, element);
}
function claim_svg_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, svg_element);
}
function claim_text(nodes, data) {
    return claim_node(nodes, (node) => node.nodeType === 3, (node) => {
        const dataStr = '' + data;
        if (node.data.startsWith(dataStr)) {
            if (node.data.length !== dataStr.length) {
                return node.splitText(dataStr.length);
            }
        }
        else {
            node.data = dataStr;
        }
    }, () => text(data), true // Text nodes should not update last index since it is likely not worth it to eliminate an increasing subsequence of actual elements
    );
}
function claim_space(nodes) {
    return claim_text(nodes, ' ');
}
function set_data(text, data) {
    data = '' + data;
    if (text.data === data)
        return;
    text.data = data;
}
function set_style(node, key, value, important) {
    if (value == null) {
        node.style.removeProperty(key);
    }
    else {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
}

let current_component;
function set_current_component(component) {
    current_component = component;
}

const dirty_components = [];
const binding_callbacks = [];
let render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = /* @__PURE__ */ Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();
let flushidx = 0; // Do *not* move this inside the flush() function
function flush() {
    // Do not reenter flush while dirty components are updated, as this can
    // result in an infinite loop. Instead, let the inner flush handle it.
    // Reentrancy is ok afterwards for bindings etc.
    if (flushidx !== 0) {
        return;
    }
    const saved_component = current_component;
    do {
        // first, call beforeUpdate functions
        // and update components
        try {
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
        }
        catch (e) {
            // reset dirty state to not end up in a deadlocked state and then rethrow
            dirty_components.length = 0;
            flushidx = 0;
            throw e;
        }
        set_current_component(null);
        dirty_components.length = 0;
        flushidx = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
/**
 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
 */
function flush_render_callbacks(fns) {
    const filtered = [];
    const targets = [];
    render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
    targets.forEach((c) => c());
    render_callbacks = filtered;
}
const outroing = new Set();
let outros;
function group_outros() {
    outros = {
        r: 0,
        c: [],
        p: outros // parent group
    };
}
function check_outros() {
    if (!outros.r) {
        run_all(outros.c);
    }
    outros = outros.p;
}
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function transition_out(block, local, detach, callback) {
    if (block && block.o) {
        if (outroing.has(block))
            return;
        outroing.add(block);
        outros.c.push(() => {
            outroing.delete(block);
            if (callback) {
                if (detach)
                    block.d(1);
                callback();
            }
        });
        block.o(local);
    }
    else if (callback) {
        callback();
    }
}
function create_component(block) {
    block && block.c();
}
function claim_component(block, parent_nodes) {
    block && block.l(parent_nodes);
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
            // if the component was destroyed immediately
            // it will update the `$$.on_destroy` reference to `null`.
            // the destructured on_destroy may still reference to the old array
            if (component.$$.on_destroy) {
                component.$$.on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        flush_render_callbacks($$.after_update);
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: [],
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false,
        root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            start_hydrating();
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        end_hydrating();
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        if (!is_function(callback)) {
            return noop;
        }
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

/**
 * lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/** Used as references for various `Number` constants. */
var NAN = 0 / 0;

/** `Object#toString` result references. */
var symbolTag = '[object Symbol]';

/** Used to match leading and trailing whitespace. */
var reTrim = /^\s+|\s+$/g;

/** Used to detect bad signed hexadecimal string values. */
var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;

/** Used to detect binary string values. */
var reIsBinary = /^0b[01]+$/i;

/** Used to detect octal string values. */
var reIsOctal = /^0o[0-7]+$/i;

/** Built-in method references without a dependency on `root`. */
var freeParseInt = parseInt;

/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof commonjsGlobal == 'object' && commonjsGlobal && commonjsGlobal.Object === Object && commonjsGlobal;

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

/** Used for built-in method references. */
var objectProto = Object.prototype;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max,
    nativeMin = Math.min;

/**
 * Gets the timestamp of the number of milliseconds that have elapsed since
 * the Unix epoch (1 January 1970 00:00:00 UTC).
 *
 * @static
 * @memberOf _
 * @since 2.4.0
 * @category Date
 * @returns {number} Returns the timestamp.
 * @example
 *
 * _.defer(function(stamp) {
 *   console.log(_.now() - stamp);
 * }, _.now());
 * // => Logs the number of milliseconds it took for the deferred invocation.
 */
var now = function() {
  return root.Date.now();
};

/**
 * Creates a debounced function that delays invoking `func` until after `wait`
 * milliseconds have elapsed since the last time the debounced function was
 * invoked. The debounced function comes with a `cancel` method to cancel
 * delayed `func` invocations and a `flush` method to immediately invoke them.
 * Provide `options` to indicate whether `func` should be invoked on the
 * leading and/or trailing edge of the `wait` timeout. The `func` is invoked
 * with the last arguments provided to the debounced function. Subsequent
 * calls to the debounced function return the result of the last `func`
 * invocation.
 *
 * **Note:** If `leading` and `trailing` options are `true`, `func` is
 * invoked on the trailing edge of the timeout only if the debounced function
 * is invoked more than once during the `wait` timeout.
 *
 * If `wait` is `0` and `leading` is `false`, `func` invocation is deferred
 * until to the next tick, similar to `setTimeout` with a timeout of `0`.
 *
 * See [David Corbacho's article](https://css-tricks.com/debouncing-throttling-explained-examples/)
 * for details over the differences between `_.debounce` and `_.throttle`.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Function
 * @param {Function} func The function to debounce.
 * @param {number} [wait=0] The number of milliseconds to delay.
 * @param {Object} [options={}] The options object.
 * @param {boolean} [options.leading=false]
 *  Specify invoking on the leading edge of the timeout.
 * @param {number} [options.maxWait]
 *  The maximum time `func` is allowed to be delayed before it's invoked.
 * @param {boolean} [options.trailing=true]
 *  Specify invoking on the trailing edge of the timeout.
 * @returns {Function} Returns the new debounced function.
 * @example
 *
 * // Avoid costly calculations while the window size is in flux.
 * jQuery(window).on('resize', _.debounce(calculateLayout, 150));
 *
 * // Invoke `sendMail` when clicked, debouncing subsequent calls.
 * jQuery(element).on('click', _.debounce(sendMail, 300, {
 *   'leading': true,
 *   'trailing': false
 * }));
 *
 * // Ensure `batchLog` is invoked once after 1 second of debounced calls.
 * var debounced = _.debounce(batchLog, 250, { 'maxWait': 1000 });
 * var source = new EventSource('/stream');
 * jQuery(source).on('message', debounced);
 *
 * // Cancel the trailing debounced invocation.
 * jQuery(window).on('popstate', debounced.cancel);
 */
function debounce(func, wait, options) {
  var lastArgs,
      lastThis,
      maxWait,
      result,
      timerId,
      lastCallTime,
      lastInvokeTime = 0,
      leading = false,
      maxing = false,
      trailing = true;

  if (typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  wait = toNumber(wait) || 0;
  if (isObject(options)) {
    leading = !!options.leading;
    maxing = 'maxWait' in options;
    maxWait = maxing ? nativeMax(toNumber(options.maxWait) || 0, wait) : maxWait;
    trailing = 'trailing' in options ? !!options.trailing : trailing;
  }

  function invokeFunc(time) {
    var args = lastArgs,
        thisArg = lastThis;

    lastArgs = lastThis = undefined;
    lastInvokeTime = time;
    result = func.apply(thisArg, args);
    return result;
  }

  function leadingEdge(time) {
    // Reset any `maxWait` timer.
    lastInvokeTime = time;
    // Start the timer for the trailing edge.
    timerId = setTimeout(timerExpired, wait);
    // Invoke the leading edge.
    return leading ? invokeFunc(time) : result;
  }

  function remainingWait(time) {
    var timeSinceLastCall = time - lastCallTime,
        timeSinceLastInvoke = time - lastInvokeTime,
        result = wait - timeSinceLastCall;

    return maxing ? nativeMin(result, maxWait - timeSinceLastInvoke) : result;
  }

  function shouldInvoke(time) {
    var timeSinceLastCall = time - lastCallTime,
        timeSinceLastInvoke = time - lastInvokeTime;

    // Either this is the first call, activity has stopped and we're at the
    // trailing edge, the system time has gone backwards and we're treating
    // it as the trailing edge, or we've hit the `maxWait` limit.
    return (lastCallTime === undefined || (timeSinceLastCall >= wait) ||
      (timeSinceLastCall < 0) || (maxing && timeSinceLastInvoke >= maxWait));
  }

  function timerExpired() {
    var time = now();
    if (shouldInvoke(time)) {
      return trailingEdge(time);
    }
    // Restart the timer.
    timerId = setTimeout(timerExpired, remainingWait(time));
  }

  function trailingEdge(time) {
    timerId = undefined;

    // Only invoke if we have `lastArgs` which means `func` has been
    // debounced at least once.
    if (trailing && lastArgs) {
      return invokeFunc(time);
    }
    lastArgs = lastThis = undefined;
    return result;
  }

  function cancel() {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
    lastInvokeTime = 0;
    lastArgs = lastCallTime = lastThis = timerId = undefined;
  }

  function flush() {
    return timerId === undefined ? result : trailingEdge(now());
  }

  function debounced() {
    var time = now(),
        isInvoking = shouldInvoke(time);

    lastArgs = arguments;
    lastThis = this;
    lastCallTime = time;

    if (isInvoking) {
      if (timerId === undefined) {
        return leadingEdge(lastCallTime);
      }
      if (maxing) {
        // Handle invocations in a tight loop.
        timerId = setTimeout(timerExpired, wait);
        return invokeFunc(lastCallTime);
      }
    }
    if (timerId === undefined) {
      timerId = setTimeout(timerExpired, wait);
    }
    return result;
  }
  debounced.cancel = cancel;
  debounced.flush = flush;
  return debounced;
}

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && objectToString.call(value) == symbolTag);
}

/**
 * Converts `value` to a number.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to process.
 * @returns {number} Returns the number.
 * @example
 *
 * _.toNumber(3.2);
 * // => 3.2
 *
 * _.toNumber(Number.MIN_VALUE);
 * // => 5e-324
 *
 * _.toNumber(Infinity);
 * // => Infinity
 *
 * _.toNumber('3.2');
 * // => 3.2
 */
function toNumber(value) {
  if (typeof value == 'number') {
    return value;
  }
  if (isSymbol(value)) {
    return NAN;
  }
  if (isObject(value)) {
    var other = typeof value.valueOf == 'function' ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value != 'string') {
    return value === 0 ? value : +value;
  }
  value = value.replace(reTrim, '');
  var isBinary = reIsBinary.test(value);
  return (isBinary || reIsOctal.test(value))
    ? freeParseInt(value.slice(2), isBinary ? 2 : 8)
    : (reIsBadHex.test(value) ? NAN : +value);
}

var lodash_debounce = debounce;

/* src/images/star-filled.svelte generated by Svelte v3.59.2 */

function create_fragment$3(ctx) {
	let svg;
	let path;

	return {
		c() {
			svg = svg_element("svg");
			path = svg_element("path");
			this.h();
		},
		l(nodes) {
			svg = claim_svg_element(nodes, "svg", {
				xmlns: true,
				width: true,
				height: true,
				viewBox: true
			});

			var svg_nodes = children(svg);
			path = claim_svg_element(svg_nodes, "path", { d: true, style: true });
			children(path).forEach(detach);
			svg_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(path, "d", "M12 .288l2.833 8.718h9.167l-7.417 5.389 2.833 8.718-7.416-5.388-7.417 5.388 2.833-8.718-7.416-5.389h9.167z");
			set_style(path, "fill", "rgb(106, 27, 154)");
			attr(svg, "xmlns", "http://www.w3.org/2000/svg");
			attr(svg, "width", "24");
			attr(svg, "height", "24");
			attr(svg, "viewBox", "0 0 24 24");
		},
		m(target, anchor) {
			insert_hydration(target, svg, anchor);
			append_hydration(svg, path);
		},
		p: noop,
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(svg);
		}
	};
}

class Star_filled extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, null, create_fragment$3, safe_not_equal, {});
	}
}

/* src/images/star-stroke.svelte generated by Svelte v3.59.2 */

function create_fragment$2(ctx) {
	let svg;
	let path;

	return {
		c() {
			svg = svg_element("svg");
			path = svg_element("path");
			this.h();
		},
		l(nodes) {
			svg = claim_svg_element(nodes, "svg", {
				width: true,
				height: true,
				xmlns: true,
				"fill-rule": true,
				"clip-rule": true
			});

			var svg_nodes = children(svg);
			path = claim_svg_element(svg_nodes, "path", { d: true, style: true });
			children(path).forEach(detach);
			svg_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(path, "d", "M15.668 8.626l8.332 1.159-6.065 5.874 1.48 8.341-7.416-3.997-7.416 3.997 1.481-8.341-6.064-5.874 8.331-1.159 3.668-7.626 3.669 7.626zm-6.67.925l-6.818.948 4.963 4.807-1.212 6.825 6.068-3.271 6.069 3.271-1.212-6.826 4.964-4.806-6.819-.948-3.002-6.241-3.001 6.241z");
			set_style(path, "fill", "rgb(106, 27, 154)");
			attr(svg, "width", "24");
			attr(svg, "height", "24");
			attr(svg, "xmlns", "http://www.w3.org/2000/svg");
			attr(svg, "fill-rule", "evenodd");
			attr(svg, "clip-rule", "evenodd");
		},
		m(target, anchor) {
			insert_hydration(target, svg, anchor);
			append_hydration(svg, path);
		},
		p: noop,
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(svg);
		}
	};
}

class Star_stroke extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, null, create_fragment$2, safe_not_equal, {});
	}
}

/* src/FavHeader.svelte generated by Svelte v3.59.2 */

function add_css$1(target) {
	append_styles(target, "svelte-1ayofce", ".fav-header.svelte-1ayofce{display:flex;justify-content:flex-end}.star.svelte-1ayofce{height:36px;widows:36px}");
}

// (19:4) {#if isFav}
function create_if_block_1(ctx) {
	let starfilled;
	let current;
	starfilled = new Star_filled({});

	return {
		c() {
			create_component(starfilled.$$.fragment);
		},
		l(nodes) {
			claim_component(starfilled.$$.fragment, nodes);
		},
		m(target, anchor) {
			mount_component(starfilled, target, anchor);
			current = true;
		},
		i(local) {
			if (current) return;
			transition_in(starfilled.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(starfilled.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(starfilled, detaching);
		}
	};
}

// (22:4) {#if !isFav}
function create_if_block$1(ctx) {
	let starstroke;
	let current;
	starstroke = new Star_stroke({});

	return {
		c() {
			create_component(starstroke.$$.fragment);
		},
		l(nodes) {
			claim_component(starstroke.$$.fragment, nodes);
		},
		m(target, anchor) {
			mount_component(starstroke, target, anchor);
			current = true;
		},
		i(local) {
			if (current) return;
			transition_in(starstroke.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(starstroke.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(starstroke, detaching);
		}
	};
}

function create_fragment$1(ctx) {
	let div1;
	let div0;
	let t;
	let current;
	let mounted;
	let dispose;
	let if_block0 = /*isFav*/ ctx[0] && create_if_block_1();
	let if_block1 = !/*isFav*/ ctx[0] && create_if_block$1();

	return {
		c() {
			div1 = element("div");
			div0 = element("div");
			if (if_block0) if_block0.c();
			t = space();
			if (if_block1) if_block1.c();
			this.h();
		},
		l(nodes) {
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			if (if_block0) if_block0.l(div0_nodes);
			t = claim_space(div0_nodes);
			if (if_block1) if_block1.l(div0_nodes);
			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "star svelte-1ayofce");
			attr(div1, "class", "fav-header svelte-1ayofce");
		},
		m(target, anchor) {
			insert_hydration(target, div1, anchor);
			append_hydration(div1, div0);
			if (if_block0) if_block0.m(div0, null);
			append_hydration(div0, t);
			if (if_block1) if_block1.m(div0, null);
			current = true;

			if (!mounted) {
				dispose = listen(div0, "click", /*toggleFav*/ ctx[1]);
				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			if (/*isFav*/ ctx[0]) {
				if (if_block0) {
					if (dirty & /*isFav*/ 1) {
						transition_in(if_block0, 1);
					}
				} else {
					if_block0 = create_if_block_1();
					if_block0.c();
					transition_in(if_block0, 1);
					if_block0.m(div0, t);
				}
			} else if (if_block0) {
				group_outros();

				transition_out(if_block0, 1, 1, () => {
					if_block0 = null;
				});

				check_outros();
			}

			if (!/*isFav*/ ctx[0]) {
				if (if_block1) {
					if (dirty & /*isFav*/ 1) {
						transition_in(if_block1, 1);
					}
				} else {
					if_block1 = create_if_block$1();
					if_block1.c();
					transition_in(if_block1, 1);
					if_block1.m(div0, null);
				}
			} else if (if_block1) {
				group_outros();

				transition_out(if_block1, 1, 1, () => {
					if_block1 = null;
				});

				check_outros();
			}
		},
		i(local) {
			if (current) return;
			transition_in(if_block0);
			transition_in(if_block1);
			current = true;
		},
		o(local) {
			transition_out(if_block0);
			transition_out(if_block1);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div1);
			if (if_block0) if_block0.d();
			if (if_block1) if_block1.d();
			mounted = false;
			dispose();
		}
	};
}

function instance$2($$self, $$props, $$invalidate) {
	let isFav;
	let { onFavorite } = $$props;
	let { entry } = $$props;

	const toggleFav = lodash_debounce(
		() => {
			$$invalidate(0, isFav = !isFav);
			onFavorite?.(entry.index, isFav);
		},
		200
	);

	$$self.$$set = $$props => {
		if ('onFavorite' in $$props) $$invalidate(2, onFavorite = $$props.onFavorite);
		if ('entry' in $$props) $$invalidate(3, entry = $$props.entry);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*entry*/ 8) {
			$$invalidate(0, isFav = entry?.is_fav || false);
		}
	};

	return [isFav, toggleFav, onFavorite, entry];
}

class FavHeader extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$2, create_fragment$1, safe_not_equal, { onFavorite: 2, entry: 3 }, add_css$1);
	}
}

/* src/InstanceView.svelte generated by Svelte v3.59.2 */

function add_css(target) {
	append_styles(target, "svelte-19fzwxa", ".label.svelte-19fzwxa{margin-right:5px;font-size:10px;color:rgba(0, 0, 0, 0.5);font-variant:small-caps}.text.svelte-19fzwxa{display:flex;flex-direction:row}.value.svelte-19fzwxa{font-size:10px}.box.svelte-19fzwxa{width:min-content;padding:5px;border:0.5px solid rgb(224, 224, 224)}");
}

// (30:2) {#if modelColumn && entry[modelColumn]}
function create_if_block(ctx) {
	let div;
	let span0;
	let t0;
	let t1;
	let span1;
	let t2_value = /*entry*/ ctx[0][/*modelColumn*/ ctx[1]] + "";
	let t2;

	return {
		c() {
			div = element("div");
			span0 = element("span");
			t0 = text("output:");
			t1 = space();
			span1 = element("span");
			t2 = text(t2_value);
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			span0 = claim_element(div_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t0 = claim_text(span0_nodes, "output:");
			span0_nodes.forEach(detach);
			t1 = claim_space(div_nodes);
			span1 = claim_element(div_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			t2 = claim_text(span1_nodes, t2_value);
			span1_nodes.forEach(detach);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(span0, "class", "label svelte-19fzwxa");
			attr(span1, "class", "value svelte-19fzwxa");
			attr(div, "class", "text svelte-19fzwxa");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, span0);
			append_hydration(span0, t0);
			append_hydration(div, t1);
			append_hydration(div, span1);
			append_hydration(span1, t2);
		},
		p(ctx, dirty) {
			if (dirty & /*entry, modelColumn*/ 3 && t2_value !== (t2_value = /*entry*/ ctx[0][/*modelColumn*/ ctx[1]] + "")) set_data(t2, t2_value);
		},
		d(detaching) {
			if (detaching) detach(div);
		}
	};
}

function create_fragment(ctx) {
	let div2;
	let favheader;
	let t0;
	let video;
	let source;
	let source_src_value;
	let t1;
	let a;
	let t2;
	let a_href_value;
	let t3;
	let t4;
	let br;
	let t5;
	let div0;
	let span0;
	let t6;
	let t7;
	let span1;
	let t8_value = /*entry*/ ctx[0][/*labelColumn*/ ctx[2]] + "";
	let t8;
	let t9;
	let t10;
	let div1;
	let span2;
	let t11;
	let t12;
	let span3;
	let t13_value = /*entry*/ ctx[0].index + "";
	let t13;
	let current;

	favheader = new FavHeader({
			props: {
				onFavorite: /*onFavorite*/ ctx[4],
				entry: /*entry*/ ctx[0]
			}
		});

	let if_block = /*modelColumn*/ ctx[1] && /*entry*/ ctx[0][/*modelColumn*/ ctx[1]] && create_if_block(ctx);

	return {
		c() {
			div2 = element("div");
			create_component(favheader.$$.fragment);
			t0 = space();
			video = element("video");
			source = element("source");
			t1 = text("\n    Download the\n    ");
			a = element("a");
			t2 = text("MP4");
			t3 = text("\n    video.");
			t4 = space();
			br = element("br");
			t5 = space();
			div0 = element("div");
			span0 = element("span");
			t6 = text("label:");
			t7 = space();
			span1 = element("span");
			t8 = text(t8_value);
			t9 = space();
			if (if_block) if_block.c();
			t10 = space();
			div1 = element("div");
			span2 = element("span");
			t11 = text("index:");
			t12 = space();
			span3 = element("span");
			t13 = text(t13_value);
			this.h();
		},
		l(nodes) {
			div2 = claim_element(nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			claim_component(favheader.$$.fragment, div2_nodes);
			t0 = claim_space(div2_nodes);
			video = claim_element(div2_nodes, "VIDEO", { width: true });
			var video_nodes = children(video);
			source = claim_element(video_nodes, "SOURCE", { src: true, type: true });
			t1 = claim_text(video_nodes, "\n    Download the\n    ");
			a = claim_element(video_nodes, "A", { href: true });
			var a_nodes = children(a);
			t2 = claim_text(a_nodes, "MP4");
			a_nodes.forEach(detach);
			t3 = claim_text(video_nodes, "\n    video.");
			video_nodes.forEach(detach);
			t4 = claim_space(div2_nodes);
			br = claim_element(div2_nodes, "BR", {});
			t5 = claim_space(div2_nodes);
			div0 = claim_element(div2_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			span0 = claim_element(div0_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t6 = claim_text(span0_nodes, "label:");
			span0_nodes.forEach(detach);
			t7 = claim_space(div0_nodes);
			span1 = claim_element(div0_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			t8 = claim_text(span1_nodes, t8_value);
			span1_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t9 = claim_space(div2_nodes);
			if (if_block) if_block.l(div2_nodes);
			t10 = claim_space(div2_nodes);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			span2 = claim_element(div1_nodes, "SPAN", { class: true });
			var span2_nodes = children(span2);
			t11 = claim_text(span2_nodes, "index:");
			span2_nodes.forEach(detach);
			t12 = claim_space(div1_nodes);
			span3 = claim_element(div1_nodes, "SPAN", { class: true });
			var span3_nodes = children(span3);
			t13 = claim_text(span3_nodes, t13_value);
			span3_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			this.h();
		},
		h() {
			if (!src_url_equal(source.src, source_src_value = /*entry*/ ctx[0][/*dataColumn*/ ctx[3]])) attr(source, "src", source_src_value);
			attr(source, "type", "video/mp4");
			attr(a, "href", a_href_value = /*entry*/ ctx[0][/*dataColumn*/ ctx[3]]);
			video.controls = true;
			attr(video, "width", "250");
			attr(span0, "class", "label svelte-19fzwxa");
			attr(span1, "class", "value svelte-19fzwxa");
			attr(div0, "class", "text svelte-19fzwxa");
			attr(span2, "class", "label svelte-19fzwxa");
			attr(span3, "class", "value svelte-19fzwxa");
			attr(div1, "class", "text svelte-19fzwxa");
			attr(div2, "class", "box svelte-19fzwxa");
			set_style(div2, "background-color", `white`);
		},
		m(target, anchor) {
			insert_hydration(target, div2, anchor);
			mount_component(favheader, div2, null);
			append_hydration(div2, t0);
			append_hydration(div2, video);
			append_hydration(video, source);
			append_hydration(video, t1);
			append_hydration(video, a);
			append_hydration(a, t2);
			append_hydration(video, t3);
			append_hydration(div2, t4);
			append_hydration(div2, br);
			append_hydration(div2, t5);
			append_hydration(div2, div0);
			append_hydration(div0, span0);
			append_hydration(span0, t6);
			append_hydration(div0, t7);
			append_hydration(div0, span1);
			append_hydration(span1, t8);
			append_hydration(div2, t9);
			if (if_block) if_block.m(div2, null);
			append_hydration(div2, t10);
			append_hydration(div2, div1);
			append_hydration(div1, span2);
			append_hydration(span2, t11);
			append_hydration(div1, t12);
			append_hydration(div1, span3);
			append_hydration(span3, t13);
			current = true;
		},
		p(ctx, [dirty]) {
			const favheader_changes = {};
			if (dirty & /*entry*/ 1) favheader_changes.entry = /*entry*/ ctx[0];
			favheader.$set(favheader_changes);

			if (!current || dirty & /*entry, dataColumn*/ 9 && !src_url_equal(source.src, source_src_value = /*entry*/ ctx[0][/*dataColumn*/ ctx[3]])) {
				attr(source, "src", source_src_value);
			}

			if (!current || dirty & /*entry, dataColumn*/ 9 && a_href_value !== (a_href_value = /*entry*/ ctx[0][/*dataColumn*/ ctx[3]])) {
				attr(a, "href", a_href_value);
			}

			if ((!current || dirty & /*entry, labelColumn*/ 5) && t8_value !== (t8_value = /*entry*/ ctx[0][/*labelColumn*/ ctx[2]] + "")) set_data(t8, t8_value);

			if (/*modelColumn*/ ctx[1] && /*entry*/ ctx[0][/*modelColumn*/ ctx[1]]) {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block(ctx);
					if_block.c();
					if_block.m(div2, t10);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}

			if ((!current || dirty & /*entry*/ 1) && t13_value !== (t13_value = /*entry*/ ctx[0].index + "")) set_data(t13, t13_value);
		},
		i(local) {
			if (current) return;
			transition_in(favheader.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(favheader.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div2);
			destroy_component(favheader);
			if (if_block) if_block.d();
		}
	};
}

function instance$1($$self, $$props, $$invalidate) {
	let { entry } = $$props;
	let { options } = $$props;
	let { modelColumn } = $$props;
	let { labelColumn } = $$props;
	let { dataColumn } = $$props;
	let { idColumn } = $$props;
	let { handlers } = $$props;
	let onFavorite = handlers?.onFavorite;

	$$self.$$set = $$props => {
		if ('entry' in $$props) $$invalidate(0, entry = $$props.entry);
		if ('options' in $$props) $$invalidate(5, options = $$props.options);
		if ('modelColumn' in $$props) $$invalidate(1, modelColumn = $$props.modelColumn);
		if ('labelColumn' in $$props) $$invalidate(2, labelColumn = $$props.labelColumn);
		if ('dataColumn' in $$props) $$invalidate(3, dataColumn = $$props.dataColumn);
		if ('idColumn' in $$props) $$invalidate(6, idColumn = $$props.idColumn);
		if ('handlers' in $$props) $$invalidate(7, handlers = $$props.handlers);
	};

	return [
		entry,
		modelColumn,
		labelColumn,
		dataColumn,
		onFavorite,
		options,
		idColumn,
		handlers
	];
}

class InstanceView extends SvelteComponent {
	constructor(options) {
		super();

		init(
			this,
			options,
			instance$1,
			create_fragment,
			safe_not_equal,
			{
				entry: 0,
				options: 5,
				modelColumn: 1,
				labelColumn: 2,
				dataColumn: 3,
				idColumn: 6,
				handlers: 7
			},
			add_css
		);
	}
}

/* src/OptionsView.svelte generated by Svelte v3.59.2 */

function instance($$self, $$props, $$invalidate) {
	let { setOptions } = $$props;

	$$self.$$set = $$props => {
		if ('setOptions' in $$props) $$invalidate(0, setOptions = $$props.setOptions);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*setOptions*/ 1) {
			setOptions({ optionA: "hello world" });
		}
	};

	return [setOptions];
}

class OptionsView extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, null, safe_not_equal, { setOptions: 0 });
	}
}

function getInstance(
  div,
  viewOptions,
  entry,
  modelColumn,
  labelColumn,
  dataColumn,
  idColumn,
  handlers,
) {
  new InstanceView({
    target: div,
    props: {
      entry: entry,
      viewOptions: viewOptions,
      modelColumn: modelColumn,
      labelColumn: labelColumn,
      dataColumn: dataColumn,
      idColumn: idColumn,
      handlers,
    },
    hydrate: true,
  });
}

function getOptions(div, setOptions) {
  new OptionsView({
    target: div,
    props: {
      setOptions,
    },
  });
}

export { getInstance, getOptions };
