
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(window.document);
var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
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
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function validate_store(store, name) {
        if (store != null && typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }
    function exclude_internal_props(props) {
        const result = {};
        for (const k in props)
            if (k[0] !== '$')
                result[k] = props[k];
        return result;
    }
    function action_destroyer(action_result) {
        return action_result && is_function(action_result.destroy) ? action_result.destroy : noop;
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
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
        // We know that all children have claim_order values since the unclaimed have been detached
        const children = target.childNodes;
        /*
        * Reorder claimed children optimally.
        * We can reorder claimed children optimally by finding the longest subsequence of
        * nodes that are already claimed in order and only moving the rest. The longest
        * subsequence subsequence of nodes that are claimed in order can be found by
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
            const seqLen = upper_bound(1, longest + 1, idx => children[m[idx]].claim_order, current) - 1;
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
        if (is_hydrating) {
            init_hydrate(target);
            if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentElement !== target))) {
                target.actual_end_child = target.firstChild;
            }
            if (node !== target.actual_end_child) {
                target.insertBefore(node, target.actual_end_child);
            }
            else {
                target.actual_end_child = node.nextSibling;
            }
        }
        else if (node.parentNode !== target) {
            target.appendChild(node);
        }
    }
    function insert(target, node, anchor) {
        if (is_hydrating && !anchor) {
            append(target, node);
        }
        else if (node.parentNode !== target || (anchor && node.nextSibling !== anchor)) {
            target.insertBefore(node, anchor || null);
        }
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
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
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function stop_propagation(fn) {
        return function (event) {
            event.stopPropagation();
            // @ts-ignore
            return fn.call(this, event);
        };
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
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            // @ts-ignore
            callbacks.slice().forEach(fn => fn.call(this, event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function tick() {
        schedule_update();
        return resolved_promise;
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
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
        flushing = false;
        seen_callbacks.clear();
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
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);
    function outro_and_destroy_block(block, lookup) {
        transition_out(block, 1, 1, () => {
            lookup.delete(block.key);
        });
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }
    function validate_each_keys(ctx, list, get_context, get_key) {
        const keys = new Set();
        for (let i = 0; i < list.length; i++) {
            const key = get_key(get_context(ctx, list, i));
            if (keys.has(key)) {
                throw new Error('Cannot have duplicate keys in a keyed each');
            }
            keys.add(key);
        }
    }

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function get_spread_object(spread_props) {
        return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
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
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
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
            context: new Map(parent_component ? parent_component.$$.context : options.context || []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
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

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.38.3' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev('SvelteDOMSetProperty', { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    function shuffle(array) {
        var currentIndex = array.length,  randomIndex;
      
        // While there remain elements to shuffle...
        while (0 !== currentIndex) {
      
          // Pick a remaining element...
          randomIndex = Math.floor(Math.random() * currentIndex);
          currentIndex--;
      
          // And swap it with the current element.
          [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
        }
      
        return array;
      }

    const durationUnitRegex = /[a-zA-Z]/;
    const range = (size, startAt = 0) => [...Array(size).keys()].map(i => i + startAt);
    // export const characterRange = (startChar, endChar) =>
    //   String.fromCharCode(
    //     ...range(
    //       endChar.charCodeAt(0) - startChar.charCodeAt(0),
    //       startChar.charCodeAt(0)
    //     )
    //   );
    // export const zip = (arr, ...arrs) =>
    //   arr.map((val, i) => arrs.reduce((list, curr) => [...list, curr[i]], [val]));

    /* node_modules\svelte-loading-spinners\dist\Wave.svelte generated by Svelte v3.38.3 */
    const file$j = "node_modules\\svelte-loading-spinners\\dist\\Wave.svelte";

    function get_each_context$4(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i];
    	return child_ctx;
    }

    // (48:2) {#each range(10, 0) as version}
    function create_each_block$4(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			attr_dev(div, "class", "bar svelte-8cmcz4");
    			set_style(div, "left", /*version*/ ctx[6] * (+/*size*/ ctx[3] / 5 + (+/*size*/ ctx[3] / 15 - +/*size*/ ctx[3] / 100)) + /*unit*/ ctx[1]);
    			set_style(div, "animation-delay", /*version*/ ctx[6] * (+/*durationNum*/ ctx[5] / 8.3) + /*durationUnit*/ ctx[4]);
    			add_location(div, file$j, 48, 4, 1193);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*size, unit*/ 10) {
    				set_style(div, "left", /*version*/ ctx[6] * (+/*size*/ ctx[3] / 5 + (+/*size*/ ctx[3] / 15 - +/*size*/ ctx[3] / 100)) + /*unit*/ ctx[1]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$4.name,
    		type: "each",
    		source: "(48:2) {#each range(10, 0) as version}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$k(ctx) {
    	let div;
    	let each_value = range(10, 0);
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$4(get_each_context$4(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(div, "class", "wrapper svelte-8cmcz4");
    			set_style(div, "--size", /*size*/ ctx[3] + /*unit*/ ctx[1]);
    			set_style(div, "--color", /*color*/ ctx[0]);
    			set_style(div, "--duration", /*duration*/ ctx[2]);
    			add_location(div, file$j, 44, 0, 1053);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*range, size, unit, durationNum, durationUnit*/ 58) {
    				each_value = range(10, 0);
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$4(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$4(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty & /*size, unit*/ 10) {
    				set_style(div, "--size", /*size*/ ctx[3] + /*unit*/ ctx[1]);
    			}

    			if (dirty & /*color*/ 1) {
    				set_style(div, "--color", /*color*/ ctx[0]);
    			}

    			if (dirty & /*duration*/ 4) {
    				set_style(div, "--duration", /*duration*/ ctx[2]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$k.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$k($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Wave", slots, []);
    	
    	let { color = "#FF3E00" } = $$props;
    	let { unit = "px" } = $$props;
    	let { duration = "1.25s" } = $$props;
    	let { size = "60" } = $$props;
    	let durationUnit = duration.match(durationUnitRegex)[0];
    	let durationNum = duration.replace(durationUnitRegex, "");
    	const writable_props = ["color", "unit", "duration", "size"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Wave> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("color" in $$props) $$invalidate(0, color = $$props.color);
    		if ("unit" in $$props) $$invalidate(1, unit = $$props.unit);
    		if ("duration" in $$props) $$invalidate(2, duration = $$props.duration);
    		if ("size" in $$props) $$invalidate(3, size = $$props.size);
    	};

    	$$self.$capture_state = () => ({
    		range,
    		durationUnitRegex,
    		color,
    		unit,
    		duration,
    		size,
    		durationUnit,
    		durationNum
    	});

    	$$self.$inject_state = $$props => {
    		if ("color" in $$props) $$invalidate(0, color = $$props.color);
    		if ("unit" in $$props) $$invalidate(1, unit = $$props.unit);
    		if ("duration" in $$props) $$invalidate(2, duration = $$props.duration);
    		if ("size" in $$props) $$invalidate(3, size = $$props.size);
    		if ("durationUnit" in $$props) $$invalidate(4, durationUnit = $$props.durationUnit);
    		if ("durationNum" in $$props) $$invalidate(5, durationNum = $$props.durationNum);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [color, unit, duration, size, durationUnit, durationNum];
    }

    class Wave extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$k, create_fragment$k, safe_not_equal, { color: 0, unit: 1, duration: 2, size: 3 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Wave",
    			options,
    			id: create_fragment$k.name
    		});
    	}

    	get color() {
    		throw new Error("<Wave>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set color(value) {
    		throw new Error("<Wave>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get unit() {
    		throw new Error("<Wave>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set unit(value) {
    		throw new Error("<Wave>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get duration() {
    		throw new Error("<Wave>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set duration(value) {
    		throw new Error("<Wave>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get size() {
    		throw new Error("<Wave>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set size(value) {
    		throw new Error("<Wave>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    function getNextPageIndexLimited(currentPageIndex, pagesCount) {
      if (pagesCount < 1) throw new Error('pagesCount must be at least 1')
      return Math.min(Math.max(currentPageIndex + 1, 0), pagesCount - 1)
    }

    function getNextPageIndexInfinte(currentPageIndex, pagesCount) {
      if (pagesCount < 1) throw new Error('pagesCount must be at least 1')
      const newCurrentPageIndex = Math.max(currentPageIndex, 0) + 1;
      return newCurrentPageIndex > pagesCount - 1 ? 0 : Math.max(newCurrentPageIndex, 0)
    }

    function getNextPageIndexFn(infinite) {
      return infinite ? getNextPageIndexInfinte : getNextPageIndexLimited
    }

    function getPrevPageIndexLimited(currentPageIndex, pagesCount) {
      if (pagesCount < 1) throw new Error('pagesCount must be at least 1')
      return Math.max(Math.min(currentPageIndex - 1, pagesCount - 1), 0)
    }

    function getPrevPageIndexInfinte(currentPageIndex, pagesCount) {
      if (pagesCount < 1) throw new Error('pagesCount must be at least 1')
      const newCurrentPageIndex = Math.min(currentPageIndex, pagesCount - 1) - 1;
      return newCurrentPageIndex >= 0 ? Math.min(newCurrentPageIndex, pagesCount - 1) : pagesCount - 1
    }

    function getPrevPageIndexFn(infinite) {
      return infinite ? getPrevPageIndexInfinte : getPrevPageIndexLimited
    }

    function getPageIndex(pageIndex, pagesCount) {
      if (pagesCount < 1) throw new Error('pagesCount must be at least 1')
      return pageIndex < 0 ? 0 : Math.min(pageIndex, pagesCount - 1)
    }

    function getAdjacentIndexes(pageIndex, pagesCount, infinite) {
      if (pagesCount < 1) throw new Error('pagesCount must be at least 1')
      const _pageIndex = Math.max(0, Math.min(pageIndex, pagesCount - 1));
      let rangeStart = _pageIndex - 1;
      let rangeEnd = _pageIndex + 1;
      rangeStart = rangeStart < 0
        ? infinite
          ? pagesCount - 1
          : 0
        : rangeStart; 
      rangeEnd = rangeEnd > pagesCount - 1
        ? infinite
            ? 0
            : pagesCount - 1
        : rangeEnd;
      return [...new Set([rangeStart, rangeEnd, _pageIndex])].sort((a, b) => a - b)
    }

    const initState = {
      currentPageIndex: 0,
    };

    function createStore() {
      const { subscribe, set, update } = writable(initState);

      function init(initialPageIndex) {
        set({
          ...initState,
          currentPageIndex: initialPageIndex
        });
      }

      function setCurrentPageIndex(index) {
        update(store => ({
          ...store,
          currentPageIndex: index,
        }));
      }

      function moveToPage({ pageIndex, pagesCount }) {
        update(store => {
          return {
            ...store,
            currentPageIndex: getPageIndex(pageIndex, pagesCount),
          }
        });
      }

      function next({ infinite, pagesCount }) {
        update(store => {
          const newCurrentPageIndex = getNextPageIndexFn(infinite)(store.currentPageIndex, pagesCount);
          return {
            ...store,
            currentPageIndex: newCurrentPageIndex,
          }
        });
      }

      function prev({ infinite, pagesCount }) {
        update(store => {
          const newCurrentPageIndex = getPrevPageIndexFn(infinite)(store.currentPageIndex, pagesCount);
          return {
            ...store,
            currentPageIndex: newCurrentPageIndex,
          }
        });
      }

      return {
        subscribe,
        next,
        prev,
        setCurrentPageIndex,
        init,
        moveToPage,
      };
    }

    function cubicInOut(t) {
        return t < 0.5 ? 4.0 * t * t * t : 0.5 * Math.pow(2.0 * t - 2.0, 3.0) + 1.0;
    }
    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }

    function is_date(obj) {
        return Object.prototype.toString.call(obj) === '[object Date]';
    }

    function get_interpolator(a, b) {
        if (a === b || a !== a)
            return () => a;
        const type = typeof a;
        if (type !== typeof b || Array.isArray(a) !== Array.isArray(b)) {
            throw new Error('Cannot interpolate values of different type');
        }
        if (Array.isArray(a)) {
            const arr = b.map((bi, i) => {
                return get_interpolator(a[i], bi);
            });
            return t => arr.map(fn => fn(t));
        }
        if (type === 'object') {
            if (!a || !b)
                throw new Error('Object cannot be null');
            if (is_date(a) && is_date(b)) {
                a = a.getTime();
                b = b.getTime();
                const delta = b - a;
                return t => new Date(a + t * delta);
            }
            const keys = Object.keys(b);
            const interpolators = {};
            keys.forEach(key => {
                interpolators[key] = get_interpolator(a[key], b[key]);
            });
            return t => {
                const result = {};
                keys.forEach(key => {
                    result[key] = interpolators[key](t);
                });
                return result;
            };
        }
        if (type === 'number') {
            const delta = b - a;
            return t => a + t * delta;
        }
        throw new Error(`Cannot interpolate ${type} values`);
    }
    function tweened(value, defaults = {}) {
        const store = writable(value);
        let task;
        let target_value = value;
        function set(new_value, opts) {
            if (value == null) {
                store.set(value = new_value);
                return Promise.resolve();
            }
            target_value = new_value;
            let previous_task = task;
            let started = false;
            let { delay = 0, duration = 400, easing = identity, interpolate = get_interpolator } = assign(assign({}, defaults), opts);
            if (duration === 0) {
                if (previous_task) {
                    previous_task.abort();
                    previous_task = null;
                }
                store.set(value = target_value);
                return Promise.resolve();
            }
            const start = now() + delay;
            let fn;
            task = loop(now => {
                if (now < start)
                    return true;
                if (!started) {
                    fn = interpolate(value, new_value);
                    if (typeof duration === 'function')
                        duration = duration(value, new_value);
                    started = true;
                }
                if (previous_task) {
                    previous_task.abort();
                    previous_task = null;
                }
                const elapsed = now - start;
                if (elapsed > duration) {
                    store.set(value = new_value);
                    return false;
                }
                // @ts-ignore
                store.set(value = fn(easing(elapsed / duration)));
                return true;
            });
            return task.promise;
        }
        return {
            set,
            update: (fn, opts) => set(fn(target_value, value), opts),
            subscribe: store.subscribe
        };
    }

    /* node_modules\svelte-carousel\src\components\Dot\Dot.svelte generated by Svelte v3.38.3 */
    const file$i = "node_modules\\svelte-carousel\\src\\components\\Dot\\Dot.svelte";

    function create_fragment$j(ctx) {
    	let div1;
    	let div0;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			attr_dev(div0, "class", "sc-carousel-dot__dot svelte-18q6rl6");
    			set_style(div0, "height", /*$size*/ ctx[1] + "px");
    			set_style(div0, "width", /*$size*/ ctx[1] + "px");
    			toggle_class(div0, "sc-carousel-dot__dot_active", /*active*/ ctx[0]);
    			add_location(div0, file$i, 23, 2, 459);
    			attr_dev(div1, "class", "sc-carousel-dot__container svelte-18q6rl6");
    			add_location(div1, file$i, 22, 0, 415);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);

    			if (!mounted) {
    				dispose = listen_dev(div0, "click", /*click_handler*/ ctx[3], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*$size*/ 2) {
    				set_style(div0, "height", /*$size*/ ctx[1] + "px");
    			}

    			if (dirty & /*$size*/ 2) {
    				set_style(div0, "width", /*$size*/ ctx[1] + "px");
    			}

    			if (dirty & /*active*/ 1) {
    				toggle_class(div0, "sc-carousel-dot__dot_active", /*active*/ ctx[0]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$j.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const DOT_SIZE_PX = 5;
    const ACTIVE_DOT_SIZE_PX = 8;

    function instance$j($$self, $$props, $$invalidate) {
    	let $size;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Dot", slots, []);
    	const size = tweened(DOT_SIZE_PX, { duration: 250, easing: cubicInOut });
    	validate_store(size, "size");
    	component_subscribe($$self, size, value => $$invalidate(1, $size = value));
    	let { active = false } = $$props;
    	const writable_props = ["active"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Dot> was created with unknown prop '${key}'`);
    	});

    	function click_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	$$self.$$set = $$props => {
    		if ("active" in $$props) $$invalidate(0, active = $$props.active);
    	};

    	$$self.$capture_state = () => ({
    		tweened,
    		cubicInOut,
    		DOT_SIZE_PX,
    		ACTIVE_DOT_SIZE_PX,
    		size,
    		active,
    		$size
    	});

    	$$self.$inject_state = $$props => {
    		if ("active" in $$props) $$invalidate(0, active = $$props.active);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*active*/ 1) {
    			{
    				size.set(active ? ACTIVE_DOT_SIZE_PX : DOT_SIZE_PX);
    			}
    		}
    	};

    	return [active, $size, size, click_handler];
    }

    class Dot extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$j, create_fragment$j, safe_not_equal, { active: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Dot",
    			options,
    			id: create_fragment$j.name
    		});
    	}

    	get active() {
    		throw new Error("<Dot>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set active(value) {
    		throw new Error("<Dot>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules\svelte-carousel\src\components\Dots\Dots.svelte generated by Svelte v3.38.3 */
    const file$h = "node_modules\\svelte-carousel\\src\\components\\Dots\\Dots.svelte";

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[5] = list[i];
    	child_ctx[7] = i;
    	return child_ctx;
    }

    // (23:2) {#each Array(pagesCount) as _, pageIndex (pageIndex)}
    function create_each_block$3(key_1, ctx) {
    	let div;
    	let dot;
    	let t;
    	let current;

    	function click_handler() {
    		return /*click_handler*/ ctx[3](/*pageIndex*/ ctx[7]);
    	}

    	dot = new Dot({
    			props: {
    				active: /*currentPageIndex*/ ctx[1] === /*pageIndex*/ ctx[7]
    			},
    			$$inline: true
    		});

    	dot.$on("click", click_handler);

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			div = element("div");
    			create_component(dot.$$.fragment);
    			t = space();
    			attr_dev(div, "class", "sc-carousel-dots__dot-container svelte-ru127d");
    			add_location(div, file$h, 23, 4, 515);
    			this.first = div;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(dot, div, null);
    			append_dev(div, t);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			const dot_changes = {};
    			if (dirty & /*currentPageIndex, pagesCount*/ 3) dot_changes.active = /*currentPageIndex*/ ctx[1] === /*pageIndex*/ ctx[7];
    			dot.$set(dot_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(dot.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(dot.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(dot);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$3.name,
    		type: "each",
    		source: "(23:2) {#each Array(pagesCount) as _, pageIndex (pageIndex)}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$i(ctx) {
    	let div;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let current;
    	let each_value = Array(/*pagesCount*/ ctx[0]);
    	validate_each_argument(each_value);
    	const get_key = ctx => /*pageIndex*/ ctx[7];
    	validate_each_keys(ctx, each_value, get_each_context$3, get_key);

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context$3(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block$3(key, child_ctx));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(div, "class", "sc-carousel-dots__container svelte-ru127d");
    			add_location(div, file$h, 21, 0, 411);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*currentPageIndex, Array, pagesCount, handleDotClick*/ 7) {
    				each_value = Array(/*pagesCount*/ ctx[0]);
    				validate_each_argument(each_value);
    				group_outros();
    				validate_each_keys(ctx, each_value, get_each_context$3, get_key);
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, div, outro_and_destroy_block, create_each_block$3, null, get_each_context$3);
    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$i.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$i($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Dots", slots, []);
    	const dispatch = createEventDispatcher();
    	let { pagesCount = 1 } = $$props;
    	let { currentPageIndex = 0 } = $$props;

    	function handleDotClick(pageIndex) {
    		dispatch("pageChange", pageIndex);
    	}

    	const writable_props = ["pagesCount", "currentPageIndex"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Dots> was created with unknown prop '${key}'`);
    	});

    	const click_handler = pageIndex => handleDotClick(pageIndex);

    	$$self.$$set = $$props => {
    		if ("pagesCount" in $$props) $$invalidate(0, pagesCount = $$props.pagesCount);
    		if ("currentPageIndex" in $$props) $$invalidate(1, currentPageIndex = $$props.currentPageIndex);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		Dot,
    		dispatch,
    		pagesCount,
    		currentPageIndex,
    		handleDotClick
    	});

    	$$self.$inject_state = $$props => {
    		if ("pagesCount" in $$props) $$invalidate(0, pagesCount = $$props.pagesCount);
    		if ("currentPageIndex" in $$props) $$invalidate(1, currentPageIndex = $$props.currentPageIndex);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [pagesCount, currentPageIndex, handleDotClick, click_handler];
    }

    class Dots extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$i, create_fragment$i, safe_not_equal, { pagesCount: 0, currentPageIndex: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Dots",
    			options,
    			id: create_fragment$i.name
    		});
    	}

    	get pagesCount() {
    		throw new Error("<Dots>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set pagesCount(value) {
    		throw new Error("<Dots>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get currentPageIndex() {
    		throw new Error("<Dots>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set currentPageIndex(value) {
    		throw new Error("<Dots>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const PREV = 'prev';
    const NEXT = 'next';

    /* node_modules\svelte-carousel\src\components\Arrow\Arrow.svelte generated by Svelte v3.38.3 */
    const file$g = "node_modules\\svelte-carousel\\src\\components\\Arrow\\Arrow.svelte";

    function create_fragment$h(ctx) {
    	let div;
    	let i;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			i = element("i");
    			attr_dev(i, "class", "sc-carousel-arrow__arrow svelte-tycflj");
    			toggle_class(i, "sc-carousel-arrow__arrow-next", /*direction*/ ctx[0] === NEXT);
    			toggle_class(i, "sc-carousel-arrow__arrow-prev", /*direction*/ ctx[0] === PREV);
    			add_location(i, file$g, 19, 2, 371);
    			attr_dev(div, "class", "sc-carousel-arrow__circle svelte-tycflj");
    			toggle_class(div, "sc-carousel-arrow__circle_disabled", /*disabled*/ ctx[1]);
    			add_location(div, file$g, 14, 0, 256);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, i);

    			if (!mounted) {
    				dispose = listen_dev(div, "click", /*click_handler*/ ctx[2], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*direction, NEXT*/ 1) {
    				toggle_class(i, "sc-carousel-arrow__arrow-next", /*direction*/ ctx[0] === NEXT);
    			}

    			if (dirty & /*direction, PREV*/ 1) {
    				toggle_class(i, "sc-carousel-arrow__arrow-prev", /*direction*/ ctx[0] === PREV);
    			}

    			if (dirty & /*disabled*/ 2) {
    				toggle_class(div, "sc-carousel-arrow__circle_disabled", /*disabled*/ ctx[1]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$h.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$h($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Arrow", slots, []);
    	let { direction = NEXT } = $$props;
    	let { disabled = false } = $$props;
    	const writable_props = ["direction", "disabled"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Arrow> was created with unknown prop '${key}'`);
    	});

    	function click_handler(event) {
    		bubble.call(this, $$self, event);
    	}

    	$$self.$$set = $$props => {
    		if ("direction" in $$props) $$invalidate(0, direction = $$props.direction);
    		if ("disabled" in $$props) $$invalidate(1, disabled = $$props.disabled);
    	};

    	$$self.$capture_state = () => ({ NEXT, PREV, direction, disabled });

    	$$self.$inject_state = $$props => {
    		if ("direction" in $$props) $$invalidate(0, direction = $$props.direction);
    		if ("disabled" in $$props) $$invalidate(1, disabled = $$props.disabled);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [direction, disabled, click_handler];
    }

    class Arrow extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$h, create_fragment$h, safe_not_equal, { direction: 0, disabled: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Arrow",
    			options,
    			id: create_fragment$h.name
    		});
    	}

    	get direction() {
    		throw new Error("<Arrow>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set direction(value) {
    		throw new Error("<Arrow>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disabled() {
    		throw new Error("<Arrow>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disabled(value) {
    		throw new Error("<Arrow>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    // start event
    function addStartEventListener(source, cb) {
      source.addEventListener('mousedown', cb);
      source.addEventListener('touchstart', cb);
    }
    function removeStartEventListener(source, cb) {
      source.removeEventListener('mousedown', cb);
      source.removeEventListener('touchstart', cb);
    }

    // end event
    function addEndEventListener(source, cb) {
      source.addEventListener('mouseup', cb);
      source.addEventListener('touchend', cb);
    }
    function removeEndEventListener(source, cb) {
      source.removeEventListener('mouseup', cb);
      source.removeEventListener('touchend', cb);
    }

    // move event
    function addMoveEventListener(source, cb) {
      source.addEventListener('mousemove', cb);
      source.addEventListener('touchmove', cb);
    }
    function removeMoveEventListener(source, cb) {
      source.removeEventListener('mousemove', cb);
      source.removeEventListener('touchmove', cb);
    }

    // resize event
    function addResizeEventListener(cb) {
      window.addEventListener('resize', cb);
    }
    function removeResizeEventListener(cb) {
      window.removeEventListener('resize', cb);
    }

    function createDispatcher(source) {
      function dispatch(event, data) {
        source.dispatchEvent(
          new CustomEvent(event, {
            detail: data,
          })
        );
      }
      return dispatch
    }

    function getCoords(event) {
      if ('TouchEvent' in window && event instanceof TouchEvent) {
        const touch = event.touches[0];
        return {
          x: touch ? touch.clientX : 0,
          y: touch ? touch.clientY : 0,
        }
      }
      return {
        x: event.clientX,
        y: event.clientY,
      }
    }

    function swipeable(node, { thresholdProvider }) {
      const dispatch = createDispatcher(node);
      let x;
      let y;
      let moved = 0;

      function handleMousedown(event) {
        moved = 0;
        const coords = getCoords(event);
        x = coords.x;
        y = coords.y;
        dispatch('start', { x, y });
        addMoveEventListener(window, handleMousemove);
        addEndEventListener(window, handleMouseup);
      }

      function handleMousemove(event) {
        const coords = getCoords(event);
        const dx = coords.x - x;
        const dy = coords.y - y;
        x = coords.x;
        y = coords.y;
        dispatch('move', { x, y, dx, dy });

        if (dx !== 0 && Math.sign(dx) !== Math.sign(moved)) {
          moved = 0;
        }
        moved += dx;
        if (Math.abs(moved) > thresholdProvider()) {
          dispatch('threshold', { direction: moved > 0 ? PREV : NEXT });
          removeEndEventListener(window, handleMouseup);
          removeMoveEventListener(window, handleMousemove);
        }
      }

      function handleMouseup(event) {
        const coords = getCoords(event);
        x = coords.x;
        y = coords.y;
        dispatch('end', { x, y });
        removeEndEventListener(window, handleMouseup);
        removeMoveEventListener(window, handleMousemove);
      }

      addStartEventListener(node, handleMousedown);
      return {
        destroy() {
          removeStartEventListener(node, handleMousedown);
        },
      }
    }

    // focusin event
    function addFocusinEventListener(source, cb) {
      source.addEventListener('mouseenter', cb);
      source.addEventListener('touchstart', cb);
    }
    function removeFocusinEventListener(source, cb) {
      source.removeEventListener('mouseenter', cb);
      source.removeEventListener('touchstart', cb);
    }

    // focusout event
    function addFocusoutEventListener(source, cb) {
      source.addEventListener('mouseleave', cb);
      source.addEventListener('touchend', cb);
      source.addEventListener('touchcancel', cb);
    }
    function removeFocusoutEventListener(source, cb) {
      source.removeEventListener('mouseleave', cb);
      source.removeEventListener('touchend', cb);
      source.removeEventListener('touchcancel', cb);
    }

    function focusable(node) {
      const dispatch = createDispatcher(node);

      function handleFocusin() {
        dispatch('focused', { value: true });
      }

      function handleFocusout() {
        dispatch('focused', { value: false });
      }

      addFocusinEventListener(node, handleFocusin);
      addFocusoutEventListener(node, handleFocusout);

      return {
        destroy() {
          removeFocusinEventListener(node, handleFocusin);
          removeFocusoutEventListener(node, handleFocusout);
        },
      }
    }

    /* node_modules\svelte-carousel\src\components\Carousel\Carousel.svelte generated by Svelte v3.38.3 */
    const file$f = "node_modules\\svelte-carousel\\src\\components\\Carousel\\Carousel.svelte";

    const get_dots_slot_changes = dirty => ({
    	currentPageIndex: dirty[0] & /*originalCurrentPageIndex*/ 16,
    	pagesCount: dirty[0] & /*originalPagesCount*/ 32,
    	loaded: dirty[0] & /*loaded*/ 2048
    });

    const get_dots_slot_context = ctx => ({
    	currentPageIndex: /*originalCurrentPageIndex*/ ctx[4],
    	pagesCount: /*originalPagesCount*/ ctx[5],
    	showPage: /*handlePageChange*/ ctx[12],
    	loaded: /*loaded*/ ctx[11]
    });

    const get_next_slot_changes = dirty => ({ loaded: dirty[0] & /*loaded*/ 2048 });

    const get_next_slot_context = ctx => ({
    	showNextPage: /*showNextPage*/ ctx[14],
    	loaded: /*loaded*/ ctx[11]
    });

    const get_default_slot_changes$1 = dirty => ({ loaded: dirty[0] & /*loaded*/ 2048 });
    const get_default_slot_context$1 = ctx => ({ loaded: /*loaded*/ ctx[11] });
    const get_prev_slot_changes = dirty => ({ loaded: dirty[0] & /*loaded*/ 2048 });

    const get_prev_slot_context = ctx => ({
    	showPrevPage: /*showPrevPage*/ ctx[13],
    	loaded: /*loaded*/ ctx[11]
    });

    // (228:4) {#if arrows}
    function create_if_block_2$2(ctx) {
    	let current;
    	const prev_slot_template = /*#slots*/ ctx[30].prev;
    	const prev_slot = create_slot(prev_slot_template, ctx, /*$$scope*/ ctx[29], get_prev_slot_context);
    	const prev_slot_or_fallback = prev_slot || fallback_block_2(ctx);

    	const block = {
    		c: function create() {
    			if (prev_slot_or_fallback) prev_slot_or_fallback.c();
    		},
    		m: function mount(target, anchor) {
    			if (prev_slot_or_fallback) {
    				prev_slot_or_fallback.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (prev_slot) {
    				if (prev_slot.p && (!current || dirty[0] & /*$$scope, loaded*/ 536872960)) {
    					update_slot(prev_slot, prev_slot_template, ctx, /*$$scope*/ ctx[29], !current ? [-1, -1] : dirty, get_prev_slot_changes, get_prev_slot_context);
    				}
    			} else {
    				if (prev_slot_or_fallback && prev_slot_or_fallback.p && (!current || dirty[0] & /*infinite, originalCurrentPageIndex*/ 20)) {
    					prev_slot_or_fallback.p(ctx, !current ? [-1, -1] : dirty);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(prev_slot_or_fallback, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(prev_slot_or_fallback, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (prev_slot_or_fallback) prev_slot_or_fallback.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$2.name,
    		type: "if",
    		source: "(228:4) {#if arrows}",
    		ctx
    	});

    	return block;
    }

    // (229:39)           
    function fallback_block_2(ctx) {
    	let div;
    	let arrow;
    	let current;

    	arrow = new Arrow({
    			props: {
    				direction: "prev",
    				disabled: !/*infinite*/ ctx[2] && /*originalCurrentPageIndex*/ ctx[4] === 0
    			},
    			$$inline: true
    		});

    	arrow.$on("click", /*showPrevPage*/ ctx[13]);

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(arrow.$$.fragment);
    			attr_dev(div, "class", "sc-carousel__arrow-container svelte-1pac7rj");
    			add_location(div, file$f, 229, 8, 5895);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(arrow, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const arrow_changes = {};
    			if (dirty[0] & /*infinite, originalCurrentPageIndex*/ 20) arrow_changes.disabled = !/*infinite*/ ctx[2] && /*originalCurrentPageIndex*/ ctx[4] === 0;
    			arrow.$set(arrow_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(arrow.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(arrow.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(arrow);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block_2.name,
    		type: "fallback",
    		source: "(229:39)           ",
    		ctx
    	});

    	return block;
    }

    // (262:4) {#if arrows}
    function create_if_block_1$4(ctx) {
    	let current;
    	const next_slot_template = /*#slots*/ ctx[30].next;
    	const next_slot = create_slot(next_slot_template, ctx, /*$$scope*/ ctx[29], get_next_slot_context);
    	const next_slot_or_fallback = next_slot || fallback_block_1(ctx);

    	const block = {
    		c: function create() {
    			if (next_slot_or_fallback) next_slot_or_fallback.c();
    		},
    		m: function mount(target, anchor) {
    			if (next_slot_or_fallback) {
    				next_slot_or_fallback.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (next_slot) {
    				if (next_slot.p && (!current || dirty[0] & /*$$scope, loaded*/ 536872960)) {
    					update_slot(next_slot, next_slot_template, ctx, /*$$scope*/ ctx[29], !current ? [-1, -1] : dirty, get_next_slot_changes, get_next_slot_context);
    				}
    			} else {
    				if (next_slot_or_fallback && next_slot_or_fallback.p && (!current || dirty[0] & /*infinite, originalCurrentPageIndex, originalPagesCount*/ 52)) {
    					next_slot_or_fallback.p(ctx, !current ? [-1, -1] : dirty);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(next_slot_or_fallback, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(next_slot_or_fallback, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (next_slot_or_fallback) next_slot_or_fallback.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$4.name,
    		type: "if",
    		source: "(262:4) {#if arrows}",
    		ctx
    	});

    	return block;
    }

    // (263:39)           
    function fallback_block_1(ctx) {
    	let div;
    	let arrow;
    	let current;

    	arrow = new Arrow({
    			props: {
    				direction: "next",
    				disabled: !/*infinite*/ ctx[2] && /*originalCurrentPageIndex*/ ctx[4] === /*originalPagesCount*/ ctx[5] - 1
    			},
    			$$inline: true
    		});

    	arrow.$on("click", /*showNextPage*/ ctx[14]);

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(arrow.$$.fragment);
    			attr_dev(div, "class", "sc-carousel__arrow-container svelte-1pac7rj");
    			add_location(div, file$f, 263, 8, 6919);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(arrow, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const arrow_changes = {};
    			if (dirty[0] & /*infinite, originalCurrentPageIndex, originalPagesCount*/ 52) arrow_changes.disabled = !/*infinite*/ ctx[2] && /*originalCurrentPageIndex*/ ctx[4] === /*originalPagesCount*/ ctx[5] - 1;
    			arrow.$set(arrow_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(arrow.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(arrow.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(arrow);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block_1.name,
    		type: "fallback",
    		source: "(263:39)           ",
    		ctx
    	});

    	return block;
    }

    // (274:2) {#if dots}
    function create_if_block$6(ctx) {
    	let current;
    	const dots_slot_template = /*#slots*/ ctx[30].dots;
    	const dots_slot = create_slot(dots_slot_template, ctx, /*$$scope*/ ctx[29], get_dots_slot_context);
    	const dots_slot_or_fallback = dots_slot || fallback_block(ctx);

    	const block = {
    		c: function create() {
    			if (dots_slot_or_fallback) dots_slot_or_fallback.c();
    		},
    		m: function mount(target, anchor) {
    			if (dots_slot_or_fallback) {
    				dots_slot_or_fallback.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dots_slot) {
    				if (dots_slot.p && (!current || dirty[0] & /*$$scope, originalCurrentPageIndex, originalPagesCount, loaded*/ 536873008)) {
    					update_slot(dots_slot, dots_slot_template, ctx, /*$$scope*/ ctx[29], !current ? [-1, -1] : dirty, get_dots_slot_changes, get_dots_slot_context);
    				}
    			} else {
    				if (dots_slot_or_fallback && dots_slot_or_fallback.p && (!current || dirty[0] & /*originalPagesCount, originalCurrentPageIndex*/ 48)) {
    					dots_slot_or_fallback.p(ctx, !current ? [-1, -1] : dirty);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(dots_slot_or_fallback, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(dots_slot_or_fallback, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (dots_slot_or_fallback) dots_slot_or_fallback.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$6.name,
    		type: "if",
    		source: "(274:2) {#if dots}",
    		ctx
    	});

    	return block;
    }

    // (280:5)         
    function fallback_block(ctx) {
    	let dots_1;
    	let current;

    	dots_1 = new Dots({
    			props: {
    				pagesCount: /*originalPagesCount*/ ctx[5],
    				currentPageIndex: /*originalCurrentPageIndex*/ ctx[4]
    			},
    			$$inline: true
    		});

    	dots_1.$on("pageChange", /*pageChange_handler*/ ctx[34]);

    	const block = {
    		c: function create() {
    			create_component(dots_1.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(dots_1, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const dots_1_changes = {};
    			if (dirty[0] & /*originalPagesCount*/ 32) dots_1_changes.pagesCount = /*originalPagesCount*/ ctx[5];
    			if (dirty[0] & /*originalCurrentPageIndex*/ 16) dots_1_changes.currentPageIndex = /*originalCurrentPageIndex*/ ctx[4];
    			dots_1.$set(dots_1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(dots_1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(dots_1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(dots_1, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block.name,
    		type: "fallback",
    		source: "(280:5)         ",
    		ctx
    	});

    	return block;
    }

    function create_fragment$g(ctx) {
    	let div3;
    	let div2;
    	let t0;
    	let div1;
    	let div0;
    	let swipeable_action;
    	let t1;
    	let t2;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block0 = /*arrows*/ ctx[1] && create_if_block_2$2(ctx);
    	const default_slot_template = /*#slots*/ ctx[30].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[29], get_default_slot_context$1);
    	let if_block1 = /*arrows*/ ctx[1] && create_if_block_1$4(ctx);
    	let if_block2 = /*dots*/ ctx[3] && create_if_block$6(ctx);

    	const block = {
    		c: function create() {
    			div3 = element("div");
    			div2 = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			div1 = element("div");
    			div0 = element("div");
    			if (default_slot) default_slot.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			if (if_block2) if_block2.c();
    			attr_dev(div0, "class", "sc-carousel__pages-container svelte-1pac7rj");
    			set_style(div0, "transform", "translateX(" + /*offset*/ ctx[8] + "px)");
    			set_style(div0, "transition-duration", /*_duration*/ ctx[6] + "ms");
    			set_style(div0, "transition-timing-function", /*timingFunction*/ ctx[0]);
    			add_location(div0, file$f, 244, 6, 6304);
    			attr_dev(div1, "class", "sc-carousel__pages-window svelte-1pac7rj");
    			add_location(div1, file$f, 238, 4, 6152);
    			attr_dev(div2, "class", "sc-carousel__content-container svelte-1pac7rj");
    			add_location(div2, file$f, 226, 2, 5782);
    			attr_dev(div3, "class", "sc-carousel__carousel-container svelte-1pac7rj");
    			add_location(div3, file$f, 225, 0, 5733);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div3, anchor);
    			append_dev(div3, div2);
    			if (if_block0) if_block0.m(div2, null);
    			append_dev(div2, t0);
    			append_dev(div2, div1);
    			append_dev(div1, div0);

    			if (default_slot) {
    				default_slot.m(div0, null);
    			}

    			/*div0_binding*/ ctx[32](div0);
    			/*div1_binding*/ ctx[33](div1);
    			append_dev(div2, t1);
    			if (if_block1) if_block1.m(div2, null);
    			append_dev(div3, t2);
    			if (if_block2) if_block2.m(div3, null);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					action_destroyer(swipeable_action = swipeable.call(null, div0, {
    						thresholdProvider: /*swipeable_function*/ ctx[31]
    					})),
    					listen_dev(div0, "start", /*handleSwipeStart*/ ctx[15], false, false, false),
    					listen_dev(div0, "move", /*handleSwipeMove*/ ctx[17], false, false, false),
    					listen_dev(div0, "end", /*handleSwipeEnd*/ ctx[18], false, false, false),
    					listen_dev(div0, "threshold", /*handleThreshold*/ ctx[16], false, false, false),
    					action_destroyer(focusable.call(null, div1)),
    					listen_dev(div1, "focused", /*handleFocused*/ ctx[19], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (/*arrows*/ ctx[1]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[0] & /*arrows*/ 2) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_2$2(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(div2, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (default_slot) {
    				if (default_slot.p && (!current || dirty[0] & /*$$scope, loaded*/ 536872960)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[29], !current ? [-1, -1] : dirty, get_default_slot_changes$1, get_default_slot_context$1);
    				}
    			}

    			if (!current || dirty[0] & /*offset*/ 256) {
    				set_style(div0, "transform", "translateX(" + /*offset*/ ctx[8] + "px)");
    			}

    			if (!current || dirty[0] & /*_duration*/ 64) {
    				set_style(div0, "transition-duration", /*_duration*/ ctx[6] + "ms");
    			}

    			if (!current || dirty[0] & /*timingFunction*/ 1) {
    				set_style(div0, "transition-timing-function", /*timingFunction*/ ctx[0]);
    			}

    			if (swipeable_action && is_function(swipeable_action.update) && dirty[0] & /*pageWidth*/ 128) swipeable_action.update.call(null, {
    				thresholdProvider: /*swipeable_function*/ ctx[31]
    			});

    			if (/*arrows*/ ctx[1]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*arrows*/ 2) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_1$4(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div2, null);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (/*dots*/ ctx[3]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);

    					if (dirty[0] & /*dots*/ 8) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block$6(ctx);
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(div3, null);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			transition_in(default_slot, local);
    			transition_in(if_block1);
    			transition_in(if_block2);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block0);
    			transition_out(default_slot, local);
    			transition_out(if_block1);
    			transition_out(if_block2);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div3);
    			if (if_block0) if_block0.d();
    			if (default_slot) default_slot.d(detaching);
    			/*div0_binding*/ ctx[32](null);
    			/*div1_binding*/ ctx[33](null);
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$g.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$g($$self, $$props, $$invalidate) {
    	let originalCurrentPageIndex;
    	let originalPagesCount;
    	let loaded;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Carousel", slots, ['prev','default','next','dots']);
    	const dispatch = createEventDispatcher();

    	const directionFnDescription = {
    		[NEXT]: showNextPage,
    		[PREV]: showPrevPage
    	};

    	let { timingFunction = "ease-in-out" } = $$props;
    	let { arrows = true } = $$props;
    	let { infinite = true } = $$props;
    	let { initialPageIndex = 0 } = $$props;
    	let { duration = 500 } = $$props;
    	let _duration = duration;
    	let { autoplay = false } = $$props;
    	let { autoplayDuration = 3000 } = $$props;
    	let { autoplayDirection = NEXT } = $$props;
    	let { pauseOnFocus = false } = $$props;
    	let { dots = true } = $$props;
    	let store = createStore();
    	let currentPageIndex = 0;
    	let pagesCount = 0;
    	let pageWidth = 0;
    	let offset = 0;
    	let pageWindowElement;
    	let pagesElement;
    	let focused = false;
    	let autoplayInterval = null;

    	function applyPageSizes() {
    		const children = pagesElement.children;
    		$$invalidate(7, pageWidth = pageWindowElement.clientWidth);
    		$$invalidate(27, pagesCount = children.length);

    		for (let pageIndex = 0; pageIndex < pagesCount; pageIndex++) {
    			children[pageIndex].style.minWidth = `${pageWidth}px`;
    			children[pageIndex].style.maxWidth = `${pageWidth}px`;
    		}

    		store.init(initialPageIndex + Number(infinite));
    		offsetPage(false);
    	}

    	function applyAutoplay() {
    		if (autoplay && !autoplayInterval) {
    			autoplayInterval = setInterval(
    				() => {
    					directionFnDescription[autoplayDirection]();
    				},
    				autoplayDuration
    			);
    		}
    	}

    	function clearAutoplay() {
    		clearInterval(autoplayInterval);
    		autoplayInterval = null;
    	}

    	function addClones() {
    		const first = pagesElement.children[0];
    		const last = pagesElement.children[pagesElement.children.length - 1];
    		pagesElement.prepend(last.cloneNode(true));
    		pagesElement.append(first.cloneNode(true));
    	}

    	let cleanupFns = [];

    	onMount(() => {
    		(async () => {
    			await tick();

    			cleanupFns.push(store.subscribe(value => {
    				$$invalidate(26, currentPageIndex = value.currentPageIndex);
    			}));

    			if (pagesElement && pageWindowElement) {
    				// load first and last child to clone them 
    				$$invalidate(11, loaded = [0, pagesElement.children.length - 1]);

    				await tick();
    				infinite && addClones();
    				applyPageSizes();
    			}

    			applyAutoplay();
    			addResizeEventListener(applyPageSizes);
    		})();
    	});

    	onDestroy(() => {
    		clearAutoplay();
    		removeResizeEventListener(applyPageSizes);
    		cleanupFns.filter(fn => fn && typeof fn === "function").forEach(fn => fn());
    	});

    	function handlePageChange(pageIndex) {
    		showPage(pageIndex + Number(infinite), { offsetDelay: 0, animated: true });
    	}

    	function offsetPage(animated) {
    		$$invalidate(6, _duration = animated ? duration : 0);
    		$$invalidate(8, offset = -currentPageIndex * pageWidth);

    		if (infinite) {
    			if (currentPageIndex === 0) {
    				showPage(pagesCount - 2, { offsetDelay: duration, animated: false });
    			} else if (currentPageIndex === pagesCount - 1) {
    				showPage(1, { offsetDelay: duration, animated: false });
    			}
    		}
    	}

    	let disabled = false;

    	function safeChangePage(cb) {
    		if (disabled) return;
    		cb();
    		disabled = true;

    		setTimeout(
    			() => {
    				disabled = false;
    			},
    			duration
    		);
    	}

    	function showPage(pageIndex, { offsetDelay, animated }) {
    		safeChangePage(() => {
    			store.moveToPage({ pageIndex, pagesCount });

    			setTimeout(
    				() => {
    					offsetPage(animated);
    				},
    				offsetDelay
    			);
    		});
    	}

    	function showPrevPage() {
    		safeChangePage(() => {
    			store.prev({ infinite, pagesCount });
    			offsetPage(true);
    		});
    	}

    	function showNextPage() {
    		safeChangePage(() => {
    			store.next({ infinite, pagesCount });
    			offsetPage(true);
    		});
    	}

    	// gestures
    	function handleSwipeStart() {
    		$$invalidate(6, _duration = 0);
    	}

    	function handleThreshold(event) {
    		directionFnDescription[event.detail.direction]();
    	}

    	function handleSwipeMove(event) {
    		$$invalidate(8, offset += event.detail.dx);
    	}

    	function handleSwipeEnd() {
    		showPage(currentPageIndex, { offsetDelay: 0, animated: true });
    	}

    	function handleFocused(event) {
    		$$invalidate(28, focused = event.detail.value);
    	}

    	const writable_props = [
    		"timingFunction",
    		"arrows",
    		"infinite",
    		"initialPageIndex",
    		"duration",
    		"autoplay",
    		"autoplayDuration",
    		"autoplayDirection",
    		"pauseOnFocus",
    		"dots"
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Carousel> was created with unknown prop '${key}'`);
    	});

    	const swipeable_function = () => pageWidth / 3;

    	function div0_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			pagesElement = $$value;
    			$$invalidate(10, pagesElement);
    		});
    	}

    	function div1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			pageWindowElement = $$value;
    			$$invalidate(9, pageWindowElement);
    		});
    	}

    	const pageChange_handler = event => handlePageChange(event.detail);

    	$$self.$$set = $$props => {
    		if ("timingFunction" in $$props) $$invalidate(0, timingFunction = $$props.timingFunction);
    		if ("arrows" in $$props) $$invalidate(1, arrows = $$props.arrows);
    		if ("infinite" in $$props) $$invalidate(2, infinite = $$props.infinite);
    		if ("initialPageIndex" in $$props) $$invalidate(20, initialPageIndex = $$props.initialPageIndex);
    		if ("duration" in $$props) $$invalidate(21, duration = $$props.duration);
    		if ("autoplay" in $$props) $$invalidate(22, autoplay = $$props.autoplay);
    		if ("autoplayDuration" in $$props) $$invalidate(23, autoplayDuration = $$props.autoplayDuration);
    		if ("autoplayDirection" in $$props) $$invalidate(24, autoplayDirection = $$props.autoplayDirection);
    		if ("pauseOnFocus" in $$props) $$invalidate(25, pauseOnFocus = $$props.pauseOnFocus);
    		if ("dots" in $$props) $$invalidate(3, dots = $$props.dots);
    		if ("$$scope" in $$props) $$invalidate(29, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		onDestroy,
    		onMount,
    		tick,
    		createEventDispatcher,
    		createStore,
    		Dots,
    		Arrow,
    		NEXT,
    		PREV,
    		swipeable,
    		focusable,
    		addResizeEventListener,
    		removeResizeEventListener,
    		getAdjacentIndexes,
    		dispatch,
    		directionFnDescription,
    		timingFunction,
    		arrows,
    		infinite,
    		initialPageIndex,
    		duration,
    		_duration,
    		autoplay,
    		autoplayDuration,
    		autoplayDirection,
    		pauseOnFocus,
    		dots,
    		store,
    		currentPageIndex,
    		pagesCount,
    		pageWidth,
    		offset,
    		pageWindowElement,
    		pagesElement,
    		focused,
    		autoplayInterval,
    		applyPageSizes,
    		applyAutoplay,
    		clearAutoplay,
    		addClones,
    		cleanupFns,
    		handlePageChange,
    		offsetPage,
    		disabled,
    		safeChangePage,
    		showPage,
    		showPrevPage,
    		showNextPage,
    		handleSwipeStart,
    		handleThreshold,
    		handleSwipeMove,
    		handleSwipeEnd,
    		handleFocused,
    		originalCurrentPageIndex,
    		originalPagesCount,
    		loaded
    	});

    	$$self.$inject_state = $$props => {
    		if ("timingFunction" in $$props) $$invalidate(0, timingFunction = $$props.timingFunction);
    		if ("arrows" in $$props) $$invalidate(1, arrows = $$props.arrows);
    		if ("infinite" in $$props) $$invalidate(2, infinite = $$props.infinite);
    		if ("initialPageIndex" in $$props) $$invalidate(20, initialPageIndex = $$props.initialPageIndex);
    		if ("duration" in $$props) $$invalidate(21, duration = $$props.duration);
    		if ("_duration" in $$props) $$invalidate(6, _duration = $$props._duration);
    		if ("autoplay" in $$props) $$invalidate(22, autoplay = $$props.autoplay);
    		if ("autoplayDuration" in $$props) $$invalidate(23, autoplayDuration = $$props.autoplayDuration);
    		if ("autoplayDirection" in $$props) $$invalidate(24, autoplayDirection = $$props.autoplayDirection);
    		if ("pauseOnFocus" in $$props) $$invalidate(25, pauseOnFocus = $$props.pauseOnFocus);
    		if ("dots" in $$props) $$invalidate(3, dots = $$props.dots);
    		if ("store" in $$props) store = $$props.store;
    		if ("currentPageIndex" in $$props) $$invalidate(26, currentPageIndex = $$props.currentPageIndex);
    		if ("pagesCount" in $$props) $$invalidate(27, pagesCount = $$props.pagesCount);
    		if ("pageWidth" in $$props) $$invalidate(7, pageWidth = $$props.pageWidth);
    		if ("offset" in $$props) $$invalidate(8, offset = $$props.offset);
    		if ("pageWindowElement" in $$props) $$invalidate(9, pageWindowElement = $$props.pageWindowElement);
    		if ("pagesElement" in $$props) $$invalidate(10, pagesElement = $$props.pagesElement);
    		if ("focused" in $$props) $$invalidate(28, focused = $$props.focused);
    		if ("autoplayInterval" in $$props) autoplayInterval = $$props.autoplayInterval;
    		if ("cleanupFns" in $$props) cleanupFns = $$props.cleanupFns;
    		if ("disabled" in $$props) disabled = $$props.disabled;
    		if ("originalCurrentPageIndex" in $$props) $$invalidate(4, originalCurrentPageIndex = $$props.originalCurrentPageIndex);
    		if ("originalPagesCount" in $$props) $$invalidate(5, originalPagesCount = $$props.originalPagesCount);
    		if ("loaded" in $$props) $$invalidate(11, loaded = $$props.loaded);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*currentPageIndex, infinite*/ 67108868) {
    			$$invalidate(4, originalCurrentPageIndex = currentPageIndex - Number(infinite));
    		}

    		if ($$self.$$.dirty[0] & /*originalCurrentPageIndex*/ 16) {
    			dispatch("pageChange", originalCurrentPageIndex);
    		}

    		if ($$self.$$.dirty[0] & /*pagesCount, infinite*/ 134217732) {
    			$$invalidate(5, originalPagesCount = Math.max(pagesCount - (infinite ? 2 : 0), 1)); // without clones
    		}

    		if ($$self.$$.dirty[0] & /*pauseOnFocus, focused*/ 301989888) {
    			{
    				if (pauseOnFocus) {
    					if (focused) {
    						clearAutoplay();
    					} else {
    						applyAutoplay();
    					}
    				}
    			}
    		}

    		if ($$self.$$.dirty[0] & /*originalCurrentPageIndex, originalPagesCount, infinite*/ 52) {
    			// used for lazy loading images, preloaded only current, adjacent and cloanable images
    			$$invalidate(11, loaded = getAdjacentIndexes(originalCurrentPageIndex, originalPagesCount, infinite));
    		}
    	};

    	return [
    		timingFunction,
    		arrows,
    		infinite,
    		dots,
    		originalCurrentPageIndex,
    		originalPagesCount,
    		_duration,
    		pageWidth,
    		offset,
    		pageWindowElement,
    		pagesElement,
    		loaded,
    		handlePageChange,
    		showPrevPage,
    		showNextPage,
    		handleSwipeStart,
    		handleThreshold,
    		handleSwipeMove,
    		handleSwipeEnd,
    		handleFocused,
    		initialPageIndex,
    		duration,
    		autoplay,
    		autoplayDuration,
    		autoplayDirection,
    		pauseOnFocus,
    		currentPageIndex,
    		pagesCount,
    		focused,
    		$$scope,
    		slots,
    		swipeable_function,
    		div0_binding,
    		div1_binding,
    		pageChange_handler
    	];
    }

    class Carousel extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(
    			this,
    			options,
    			instance$g,
    			create_fragment$g,
    			safe_not_equal,
    			{
    				timingFunction: 0,
    				arrows: 1,
    				infinite: 2,
    				initialPageIndex: 20,
    				duration: 21,
    				autoplay: 22,
    				autoplayDuration: 23,
    				autoplayDirection: 24,
    				pauseOnFocus: 25,
    				dots: 3
    			},
    			[-1, -1]
    		);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Carousel",
    			options,
    			id: create_fragment$g.name
    		});
    	}

    	get timingFunction() {
    		throw new Error("<Carousel>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set timingFunction(value) {
    		throw new Error("<Carousel>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get arrows() {
    		throw new Error("<Carousel>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set arrows(value) {
    		throw new Error("<Carousel>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get infinite() {
    		throw new Error("<Carousel>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set infinite(value) {
    		throw new Error("<Carousel>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get initialPageIndex() {
    		throw new Error("<Carousel>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set initialPageIndex(value) {
    		throw new Error("<Carousel>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get duration() {
    		throw new Error("<Carousel>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set duration(value) {
    		throw new Error("<Carousel>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get autoplay() {
    		throw new Error("<Carousel>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set autoplay(value) {
    		throw new Error("<Carousel>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get autoplayDuration() {
    		throw new Error("<Carousel>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set autoplayDuration(value) {
    		throw new Error("<Carousel>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get autoplayDirection() {
    		throw new Error("<Carousel>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set autoplayDirection(value) {
    		throw new Error("<Carousel>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get pauseOnFocus() {
    		throw new Error("<Carousel>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set pauseOnFocus(value) {
    		throw new Error("<Carousel>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dots() {
    		throw new Error("<Carousel>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dots(value) {
    		throw new Error("<Carousel>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules\svelte-icons\components\IconBase.svelte generated by Svelte v3.38.3 */

    const file$e = "node_modules\\svelte-icons\\components\\IconBase.svelte";

    // (18:2) {#if title}
    function create_if_block$5(ctx) {
    	let title_1;
    	let t;

    	const block = {
    		c: function create() {
    			title_1 = svg_element("title");
    			t = text(/*title*/ ctx[0]);
    			add_location(title_1, file$e, 18, 4, 298);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, title_1, anchor);
    			append_dev(title_1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*title*/ 1) set_data_dev(t, /*title*/ ctx[0]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(title_1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$5.name,
    		type: "if",
    		source: "(18:2) {#if title}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$f(ctx) {
    	let svg;
    	let if_block_anchor;
    	let current;
    	let if_block = /*title*/ ctx[0] && create_if_block$5(ctx);
    	const default_slot_template = /*#slots*/ ctx[3].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[2], null);

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			if (default_slot) default_slot.c();
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "viewBox", /*viewBox*/ ctx[1]);
    			attr_dev(svg, "class", "svelte-c8tyih");
    			add_location(svg, file$e, 16, 0, 229);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			if (if_block) if_block.m(svg, null);
    			append_dev(svg, if_block_anchor);

    			if (default_slot) {
    				default_slot.m(svg, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*title*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$5(ctx);
    					if_block.c();
    					if_block.m(svg, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope*/ 4)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[2], !current ? -1 : dirty, null, null);
    				}
    			}

    			if (!current || dirty & /*viewBox*/ 2) {
    				attr_dev(svg, "viewBox", /*viewBox*/ ctx[1]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    			if (if_block) if_block.d();
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$f.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$f($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("IconBase", slots, ['default']);
    	let { title = null } = $$props;
    	let { viewBox } = $$props;
    	const writable_props = ["title", "viewBox"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<IconBase> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("title" in $$props) $$invalidate(0, title = $$props.title);
    		if ("viewBox" in $$props) $$invalidate(1, viewBox = $$props.viewBox);
    		if ("$$scope" in $$props) $$invalidate(2, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({ title, viewBox });

    	$$self.$inject_state = $$props => {
    		if ("title" in $$props) $$invalidate(0, title = $$props.title);
    		if ("viewBox" in $$props) $$invalidate(1, viewBox = $$props.viewBox);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [title, viewBox, $$scope, slots];
    }

    class IconBase extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$f, create_fragment$f, safe_not_equal, { title: 0, viewBox: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "IconBase",
    			options,
    			id: create_fragment$f.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*viewBox*/ ctx[1] === undefined && !("viewBox" in props)) {
    			console.warn("<IconBase> was created without expected prop 'viewBox'");
    		}
    	}

    	get title() {
    		throw new Error("<IconBase>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set title(value) {
    		throw new Error("<IconBase>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get viewBox() {
    		throw new Error("<IconBase>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set viewBox(value) {
    		throw new Error("<IconBase>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules\svelte-icons\fa\FaAngleRight.svelte generated by Svelte v3.38.3 */
    const file$d = "node_modules\\svelte-icons\\fa\\FaAngleRight.svelte";

    // (4:8) <IconBase viewBox="0 0 256 512" {...$$props}>
    function create_default_slot$7(ctx) {
    	let path;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M224.3 273l-136 136c-9.4 9.4-24.6 9.4-33.9 0l-22.6-22.6c-9.4-9.4-9.4-24.6 0-33.9l96.4-96.4-96.4-96.4c-9.4-9.4-9.4-24.6 0-33.9L54.3 103c9.4-9.4 24.6-9.4 33.9 0l136 136c9.5 9.4 9.5 24.6.1 34z");
    			add_location(path, file$d, 4, 10, 153);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$7.name,
    		type: "slot",
    		source: "(4:8) <IconBase viewBox=\\\"0 0 256 512\\\" {...$$props}>",
    		ctx
    	});

    	return block;
    }

    function create_fragment$e(ctx) {
    	let iconbase;
    	let current;
    	const iconbase_spread_levels = [{ viewBox: "0 0 256 512" }, /*$$props*/ ctx[0]];

    	let iconbase_props = {
    		$$slots: { default: [create_default_slot$7] },
    		$$scope: { ctx }
    	};

    	for (let i = 0; i < iconbase_spread_levels.length; i += 1) {
    		iconbase_props = assign(iconbase_props, iconbase_spread_levels[i]);
    	}

    	iconbase = new IconBase({ props: iconbase_props, $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(iconbase.$$.fragment);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(iconbase, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const iconbase_changes = (dirty & /*$$props*/ 1)
    			? get_spread_update(iconbase_spread_levels, [iconbase_spread_levels[0], get_spread_object(/*$$props*/ ctx[0])])
    			: {};

    			if (dirty & /*$$scope*/ 2) {
    				iconbase_changes.$$scope = { dirty, ctx };
    			}

    			iconbase.$set(iconbase_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(iconbase.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(iconbase.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(iconbase, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$e.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$e($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("FaAngleRight", slots, []);

    	$$self.$$set = $$new_props => {
    		$$invalidate(0, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    	};

    	$$self.$capture_state = () => ({ IconBase });

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(0, $$props = assign(assign({}, $$props), $$new_props));
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$props = exclude_internal_props($$props);
    	return [$$props];
    }

    class FaAngleRight extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$e, create_fragment$e, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "FaAngleRight",
    			options,
    			id: create_fragment$e.name
    		});
    	}
    }

    /* node_modules\svelte-icons\fa\FaAngleLeft.svelte generated by Svelte v3.38.3 */
    const file$c = "node_modules\\svelte-icons\\fa\\FaAngleLeft.svelte";

    // (4:8) <IconBase viewBox="0 0 256 512" {...$$props}>
    function create_default_slot$6(ctx) {
    	let path;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M31.7 239l136-136c9.4-9.4 24.6-9.4 33.9 0l22.6 22.6c9.4 9.4 9.4 24.6 0 33.9L127.9 256l96.4 96.4c9.4 9.4 9.4 24.6 0 33.9L201.7 409c-9.4 9.4-24.6 9.4-33.9 0l-136-136c-9.5-9.4-9.5-24.6-.1-34z");
    			add_location(path, file$c, 4, 10, 153);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$6.name,
    		type: "slot",
    		source: "(4:8) <IconBase viewBox=\\\"0 0 256 512\\\" {...$$props}>",
    		ctx
    	});

    	return block;
    }

    function create_fragment$d(ctx) {
    	let iconbase;
    	let current;
    	const iconbase_spread_levels = [{ viewBox: "0 0 256 512" }, /*$$props*/ ctx[0]];

    	let iconbase_props = {
    		$$slots: { default: [create_default_slot$6] },
    		$$scope: { ctx }
    	};

    	for (let i = 0; i < iconbase_spread_levels.length; i += 1) {
    		iconbase_props = assign(iconbase_props, iconbase_spread_levels[i]);
    	}

    	iconbase = new IconBase({ props: iconbase_props, $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(iconbase.$$.fragment);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(iconbase, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const iconbase_changes = (dirty & /*$$props*/ 1)
    			? get_spread_update(iconbase_spread_levels, [iconbase_spread_levels[0], get_spread_object(/*$$props*/ ctx[0])])
    			: {};

    			if (dirty & /*$$scope*/ 2) {
    				iconbase_changes.$$scope = { dirty, ctx };
    			}

    			iconbase.$set(iconbase_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(iconbase.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(iconbase.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(iconbase, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$d.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$d($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("FaAngleLeft", slots, []);

    	$$self.$$set = $$new_props => {
    		$$invalidate(0, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    	};

    	$$self.$capture_state = () => ({ IconBase });

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(0, $$props = assign(assign({}, $$props), $$new_props));
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$props = exclude_internal_props($$props);
    	return [$$props];
    }

    class FaAngleLeft extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$d, create_fragment$d, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "FaAngleLeft",
    			options,
    			id: create_fragment$d.name
    		});
    	}
    }

    /* node_modules\svelte-icons\md\MdAudiotrack.svelte generated by Svelte v3.38.3 */
    const file$b = "node_modules\\svelte-icons\\md\\MdAudiotrack.svelte";

    // (4:8) <IconBase viewBox="0 0 24 24" {...$$props}>
    function create_default_slot$5(ctx) {
    	let path;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z");
    			add_location(path, file$b, 4, 10, 151);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$5.name,
    		type: "slot",
    		source: "(4:8) <IconBase viewBox=\\\"0 0 24 24\\\" {...$$props}>",
    		ctx
    	});

    	return block;
    }

    function create_fragment$c(ctx) {
    	let iconbase;
    	let current;
    	const iconbase_spread_levels = [{ viewBox: "0 0 24 24" }, /*$$props*/ ctx[0]];

    	let iconbase_props = {
    		$$slots: { default: [create_default_slot$5] },
    		$$scope: { ctx }
    	};

    	for (let i = 0; i < iconbase_spread_levels.length; i += 1) {
    		iconbase_props = assign(iconbase_props, iconbase_spread_levels[i]);
    	}

    	iconbase = new IconBase({ props: iconbase_props, $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(iconbase.$$.fragment);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(iconbase, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const iconbase_changes = (dirty & /*$$props*/ 1)
    			? get_spread_update(iconbase_spread_levels, [iconbase_spread_levels[0], get_spread_object(/*$$props*/ ctx[0])])
    			: {};

    			if (dirty & /*$$scope*/ 2) {
    				iconbase_changes.$$scope = { dirty, ctx };
    			}

    			iconbase.$set(iconbase_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(iconbase.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(iconbase.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(iconbase, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$c.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$c($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("MdAudiotrack", slots, []);

    	$$self.$$set = $$new_props => {
    		$$invalidate(0, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    	};

    	$$self.$capture_state = () => ({ IconBase });

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(0, $$props = assign(assign({}, $$props), $$new_props));
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$props = exclude_internal_props($$props);
    	return [$$props];
    }

    class MdAudiotrack extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$c, create_fragment$c, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "MdAudiotrack",
    			options,
    			id: create_fragment$c.name
    		});
    	}
    }

    /* src\Card.svelte generated by Svelte v3.38.3 */

    const file$a = "src\\Card.svelte";
    const get_back_slot_changes = dirty => ({});
    const get_back_slot_context = ctx => ({});
    const get_front_slot_changes = dirty => ({});
    const get_front_slot_context = ctx => ({});

    function create_fragment$b(ctx) {
    	let div3;
    	let div2;
    	let div0;
    	let t;
    	let div1;
    	let current;
    	let mounted;
    	let dispose;
    	const front_slot_template = /*#slots*/ ctx[5].front;
    	const front_slot = create_slot(front_slot_template, ctx, /*$$scope*/ ctx[4], get_front_slot_context);
    	const back_slot_template = /*#slots*/ ctx[5].back;
    	const back_slot = create_slot(back_slot_template, ctx, /*$$scope*/ ctx[4], get_back_slot_context);

    	const block = {
    		c: function create() {
    			div3 = element("div");
    			div2 = element("div");
    			div0 = element("div");
    			if (front_slot) front_slot.c();
    			t = space();
    			div1 = element("div");
    			if (back_slot) back_slot.c();
    			attr_dev(div0, "class", "front-side svelte-m4rr12");
    			add_location(div0, file$a, 65, 8, 1516);
    			attr_dev(div1, "class", "back-side svelte-m4rr12");
    			add_location(div1, file$a, 70, 8, 1638);
    			attr_dev(div2, "class", "lx-card svelte-m4rr12");
    			attr_dev(div2, "style", /*transform*/ ctx[1]);
    			add_location(div2, file$a, 64, 4, 1445);
    			attr_dev(div3, "class", "svelte-m4rr12");
    			toggle_class(div3, "card-scene", !/*isMobile*/ ctx[0]);
    			toggle_class(div3, "card-scene-mobile", /*isMobile*/ ctx[0]);
    			add_location(div3, file$a, 63, 0, 1370);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div3, anchor);
    			append_dev(div3, div2);
    			append_dev(div2, div0);

    			if (front_slot) {
    				front_slot.m(div0, null);
    			}

    			append_dev(div2, t);
    			append_dev(div2, div1);

    			if (back_slot) {
    				back_slot.m(div1, null);
    			}

    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(div2, "click", /*flipCard*/ ctx[2], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (front_slot) {
    				if (front_slot.p && (!current || dirty & /*$$scope*/ 16)) {
    					update_slot(front_slot, front_slot_template, ctx, /*$$scope*/ ctx[4], !current ? -1 : dirty, get_front_slot_changes, get_front_slot_context);
    				}
    			}

    			if (back_slot) {
    				if (back_slot.p && (!current || dirty & /*$$scope*/ 16)) {
    					update_slot(back_slot, back_slot_template, ctx, /*$$scope*/ ctx[4], !current ? -1 : dirty, get_back_slot_changes, get_back_slot_context);
    				}
    			}

    			if (!current || dirty & /*transform*/ 2) {
    				attr_dev(div2, "style", /*transform*/ ctx[1]);
    			}

    			if (dirty & /*isMobile*/ 1) {
    				toggle_class(div3, "card-scene", !/*isMobile*/ ctx[0]);
    			}

    			if (dirty & /*isMobile*/ 1) {
    				toggle_class(div3, "card-scene-mobile", /*isMobile*/ ctx[0]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(front_slot, local);
    			transition_in(back_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(front_slot, local);
    			transition_out(back_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div3);
    			if (front_slot) front_slot.d(detaching);
    			if (back_slot) back_slot.d(detaching);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$b.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Card", slots, ['front','back']);
    	let transform;
    	let { holdFlip } = $$props;
    	let { isMobile } = $$props;
    	let fullWidth = "full-width";

    	function flipCard() {
    		if (holdFlip) return;
    		if (transform) $$invalidate(1, transform = ""); else $$invalidate(1, transform = "transform: rotateX(180deg);");
    	}

    	const writable_props = ["holdFlip", "isMobile"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Card> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("holdFlip" in $$props) $$invalidate(3, holdFlip = $$props.holdFlip);
    		if ("isMobile" in $$props) $$invalidate(0, isMobile = $$props.isMobile);
    		if ("$$scope" in $$props) $$invalidate(4, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		transform,
    		holdFlip,
    		isMobile,
    		fullWidth,
    		flipCard
    	});

    	$$self.$inject_state = $$props => {
    		if ("transform" in $$props) $$invalidate(1, transform = $$props.transform);
    		if ("holdFlip" in $$props) $$invalidate(3, holdFlip = $$props.holdFlip);
    		if ("isMobile" in $$props) $$invalidate(0, isMobile = $$props.isMobile);
    		if ("fullWidth" in $$props) fullWidth = $$props.fullWidth;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [isMobile, transform, flipCard, holdFlip, $$scope, slots];
    }

    class Card extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, { holdFlip: 3, isMobile: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Card",
    			options,
    			id: create_fragment$b.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*holdFlip*/ ctx[3] === undefined && !("holdFlip" in props)) {
    			console.warn("<Card> was created without expected prop 'holdFlip'");
    		}

    		if (/*isMobile*/ ctx[0] === undefined && !("isMobile" in props)) {
    			console.warn("<Card> was created without expected prop 'isMobile'");
    		}
    	}

    	get holdFlip() {
    		throw new Error("<Card>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set holdFlip(value) {
    		throw new Error("<Card>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isMobile() {
    		throw new Error("<Card>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isMobile(value) {
    		throw new Error("<Card>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    function playGDriveAudio(audioUrl) {
        var urlId = audioUrl
            .replace("https://drive.google.com/file/d/", "")
            .replace("/view?usp=sharing", "");
            
        var a = new Audio('https://drive.google.com/uc?id=' + urlId);
        a.play();
      }
    function playLocalAudio(audioUrl) {
        var a = new Audio('/sounds/' + audioUrl);
        a.play();
      }

    /* src\AudioPhrase.svelte generated by Svelte v3.38.3 */
    const file$9 = "src\\AudioPhrase.svelte";

    // (25:4) 
    function create_front_slot$2(ctx) {
    	let div1;
    	let div0;
    	let mdaudiotrack;
    	let t0;
    	let span;
    	let current;
    	let mounted;
    	let dispose;
    	mdaudiotrack = new MdAudiotrack({ $$inline: true });

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			create_component(mdaudiotrack.$$.fragment);
    			t0 = space();
    			span = element("span");
    			span.textContent = "(Click to play)";
    			add_location(span, file$9, 27, 12, 742);
    			attr_dev(div0, "class", "audio-icon svelte-ykqsm3");
    			add_location(div0, file$9, 25, 8, 600);
    			attr_dev(div1, "slot", "front");
    			attr_dev(div1, "class", "front-side svelte-ykqsm3");
    			add_location(div1, file$9, 24, 4, 553);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			mount_component(mdaudiotrack, div0, null);
    			append_dev(div0, t0);
    			append_dev(div0, span);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(
    					div0,
    					"click",
    					stop_propagation(function () {
    						if (is_function(playGDriveAudio(/*phrasesObject*/ ctx[0].audioPhraseFront))) playGDriveAudio(/*phrasesObject*/ ctx[0].audioPhraseFront).apply(this, arguments);
    					}),
    					false,
    					false,
    					true
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(mdaudiotrack.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(mdaudiotrack.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			destroy_component(mdaudiotrack);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_front_slot$2.name,
    		type: "slot",
    		source: "(25:4) ",
    		ctx
    	});

    	return block;
    }

    // (40:12) {:else}
    function create_else_block$3(ctx) {
    	let h30;
    	let t0;
    	let t1_value = /*phrasesObject*/ ctx[0].frontPhrase + "";
    	let t1;
    	let t2;
    	let h31;
    	let t3;
    	let t4_value = /*phrasesObject*/ ctx[0].backPhrase + "";
    	let t4;

    	const block = {
    		c: function create() {
    			h30 = element("h3");
    			t0 = text("Question: ");
    			t1 = text(t1_value);
    			t2 = space();
    			h31 = element("h3");
    			t3 = text("Answer: ");
    			t4 = text(t4_value);
    			add_location(h30, file$9, 40, 16, 1245);
    			add_location(h31, file$9, 41, 16, 1309);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h30, anchor);
    			append_dev(h30, t0);
    			append_dev(h30, t1);
    			insert_dev(target, t2, anchor);
    			insert_dev(target, h31, anchor);
    			append_dev(h31, t3);
    			append_dev(h31, t4);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*phrasesObject*/ 1 && t1_value !== (t1_value = /*phrasesObject*/ ctx[0].frontPhrase + "")) set_data_dev(t1, t1_value);
    			if (dirty & /*phrasesObject*/ 1 && t4_value !== (t4_value = /*phrasesObject*/ ctx[0].backPhrase + "")) set_data_dev(t4, t4_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h30);
    			if (detaching) detach_dev(t2);
    			if (detaching) detach_dev(h31);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$3.name,
    		type: "else",
    		source: "(40:12) {:else}",
    		ctx
    	});

    	return block;
    }

    // (37:12) {#if isMobile}
    function create_if_block$4(ctx) {
    	let p0;
    	let t0;
    	let t1_value = /*phrasesObject*/ ctx[0].frontPhrase + "";
    	let t1;
    	let t2;
    	let p1;
    	let t3;
    	let t4_value = /*phrasesObject*/ ctx[0].backPhrase + "";
    	let t4;

    	const block = {
    		c: function create() {
    			p0 = element("p");
    			t0 = text("Question: ");
    			t1 = text(t1_value);
    			t2 = space();
    			p1 = element("p");
    			t3 = text("Answer: ");
    			t4 = text(t4_value);
    			add_location(p0, file$9, 37, 16, 1103);
    			add_location(p1, file$9, 38, 16, 1165);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p0, anchor);
    			append_dev(p0, t0);
    			append_dev(p0, t1);
    			insert_dev(target, t2, anchor);
    			insert_dev(target, p1, anchor);
    			append_dev(p1, t3);
    			append_dev(p1, t4);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*phrasesObject*/ 1 && t1_value !== (t1_value = /*phrasesObject*/ ctx[0].frontPhrase + "")) set_data_dev(t1, t1_value);
    			if (dirty & /*phrasesObject*/ 1 && t4_value !== (t4_value = /*phrasesObject*/ ctx[0].backPhrase + "")) set_data_dev(t4, t4_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p0);
    			if (detaching) detach_dev(t2);
    			if (detaching) detach_dev(p1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$4.name,
    		type: "if",
    		source: "(37:12) {#if isMobile}",
    		ctx
    	});

    	return block;
    }

    // (31:4) 
    function create_back_slot$2(ctx) {
    	let div2;
    	let div0;
    	let mdaudiotrack;
    	let t0;
    	let span;
    	let t2;
    	let div1;
    	let current;
    	let mounted;
    	let dispose;
    	mdaudiotrack = new MdAudiotrack({ $$inline: true });

    	function select_block_type(ctx, dirty) {
    		if (/*isMobile*/ ctx[2]) return create_if_block$4;
    		return create_else_block$3;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div0 = element("div");
    			create_component(mdaudiotrack.$$.fragment);
    			t0 = space();
    			span = element("span");
    			span.textContent = "(Click to play answer.)";
    			t2 = space();
    			div1 = element("div");
    			if_block.c();
    			add_location(span, file$9, 33, 12, 990);
    			attr_dev(div0, "class", "audio-icon svelte-ykqsm3");
    			add_location(div0, file$9, 31, 8, 849);
    			add_location(div1, file$9, 35, 8, 1052);
    			attr_dev(div2, "slot", "back");
    			attr_dev(div2, "class", "back-side svelte-ykqsm3");
    			add_location(div2, file$9, 30, 4, 804);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div0);
    			mount_component(mdaudiotrack, div0, null);
    			append_dev(div0, t0);
    			append_dev(div0, span);
    			append_dev(div2, t2);
    			append_dev(div2, div1);
    			if_block.m(div1, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(
    					div0,
    					"click",
    					stop_propagation(function () {
    						if (is_function(playGDriveAudio(/*phrasesObject*/ ctx[0].audioPhraseBack))) playGDriveAudio(/*phrasesObject*/ ctx[0].audioPhraseBack).apply(this, arguments);
    					}),
    					false,
    					false,
    					true
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div1, null);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(mdaudiotrack.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(mdaudiotrack.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			destroy_component(mdaudiotrack);
    			if_block.d();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_back_slot$2.name,
    		type: "slot",
    		source: "(31:4) ",
    		ctx
    	});

    	return block;
    }

    function create_fragment$a(ctx) {
    	let card;
    	let current;

    	card = new Card({
    			props: {
    				holdFlip: /*holdFlip*/ ctx[1],
    				isMobile: /*isMobile*/ ctx[2],
    				$$slots: {
    					back: [create_back_slot$2],
    					front: [create_front_slot$2]
    				},
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(card.$$.fragment);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(card, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const card_changes = {};
    			if (dirty & /*holdFlip*/ 2) card_changes.holdFlip = /*holdFlip*/ ctx[1];
    			if (dirty & /*isMobile*/ 4) card_changes.isMobile = /*isMobile*/ ctx[2];

    			if (dirty & /*$$scope, phrasesObject, isMobile*/ 13) {
    				card_changes.$$scope = { dirty, ctx };
    			}

    			card.$set(card_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(card.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(card.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(card, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$a.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$a($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("AudioPhrase", slots, []);
    	let { phrasesObject } = $$props;
    	let { holdFlip } = $$props;
    	let { isMobile } = $$props;
    	const writable_props = ["phrasesObject", "holdFlip", "isMobile"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<AudioPhrase> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("phrasesObject" in $$props) $$invalidate(0, phrasesObject = $$props.phrasesObject);
    		if ("holdFlip" in $$props) $$invalidate(1, holdFlip = $$props.holdFlip);
    		if ("isMobile" in $$props) $$invalidate(2, isMobile = $$props.isMobile);
    	};

    	$$self.$capture_state = () => ({
    		MdAudiotrack,
    		Card,
    		playGDriveAudio,
    		phrasesObject,
    		holdFlip,
    		isMobile
    	});

    	$$self.$inject_state = $$props => {
    		if ("phrasesObject" in $$props) $$invalidate(0, phrasesObject = $$props.phrasesObject);
    		if ("holdFlip" in $$props) $$invalidate(1, holdFlip = $$props.holdFlip);
    		if ("isMobile" in $$props) $$invalidate(2, isMobile = $$props.isMobile);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [phrasesObject, holdFlip, isMobile];
    }

    class AudioPhrase extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$a, create_fragment$a, safe_not_equal, {
    			phrasesObject: 0,
    			holdFlip: 1,
    			isMobile: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "AudioPhrase",
    			options,
    			id: create_fragment$a.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*phrasesObject*/ ctx[0] === undefined && !("phrasesObject" in props)) {
    			console.warn("<AudioPhrase> was created without expected prop 'phrasesObject'");
    		}

    		if (/*holdFlip*/ ctx[1] === undefined && !("holdFlip" in props)) {
    			console.warn("<AudioPhrase> was created without expected prop 'holdFlip'");
    		}

    		if (/*isMobile*/ ctx[2] === undefined && !("isMobile" in props)) {
    			console.warn("<AudioPhrase> was created without expected prop 'isMobile'");
    		}
    	}

    	get phrasesObject() {
    		throw new Error("<AudioPhrase>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set phrasesObject(value) {
    		throw new Error("<AudioPhrase>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get holdFlip() {
    		throw new Error("<AudioPhrase>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set holdFlip(value) {
    		throw new Error("<AudioPhrase>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isMobile() {
    		throw new Error("<AudioPhrase>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isMobile(value) {
    		throw new Error("<AudioPhrase>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\TextPhrase.svelte generated by Svelte v3.38.3 */
    const file$8 = "src\\TextPhrase.svelte";

    // (28:8) {:else}
    function create_else_block_1$1(ctx) {
    	let h1;
    	let t_value = /*phrasesObject*/ ctx[0].frontPhrase + "";
    	let t;

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			t = text(t_value);
    			attr_dev(h1, "class", "svelte-ajoz6");
    			add_location(h1, file$8, 28, 12, 507);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			append_dev(h1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*phrasesObject*/ 1 && t_value !== (t_value = /*phrasesObject*/ ctx[0].frontPhrase + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_1$1.name,
    		type: "else",
    		source: "(28:8) {:else}",
    		ctx
    	});

    	return block;
    }

    // (26:8) {#if isMobile}
    function create_if_block_1$3(ctx) {
    	let h3;
    	let t_value = /*phrasesObject*/ ctx[0].frontPhrase + "";
    	let t;

    	const block = {
    		c: function create() {
    			h3 = element("h3");
    			t = text(t_value);
    			attr_dev(h3, "class", "svelte-ajoz6");
    			add_location(h3, file$8, 26, 12, 440);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h3, anchor);
    			append_dev(h3, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*phrasesObject*/ 1 && t_value !== (t_value = /*phrasesObject*/ ctx[0].frontPhrase + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h3);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$3.name,
    		type: "if",
    		source: "(26:8) {#if isMobile}",
    		ctx
    	});

    	return block;
    }

    // (25:4) 
    function create_front_slot$1(ctx) {
    	let div;

    	function select_block_type_1(ctx, dirty) {
    		if (/*isMobile*/ ctx[2]) return create_if_block_1$3;
    		return create_else_block_1$1;
    	}

    	let current_block_type = select_block_type_1(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if_block.c();
    			attr_dev(div, "slot", "front");
    			add_location(div, file$8, 24, 4, 384);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if_block.m(div, null);
    		},
    		p: function update(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type_1(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div, null);
    				}
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_front_slot$1.name,
    		type: "slot",
    		source: "(25:4) ",
    		ctx
    	});

    	return block;
    }

    // (35:8) {:else}
    function create_else_block$2(ctx) {
    	let h1;
    	let t_value = /*phrasesObject*/ ctx[0].backPhrase + "";
    	let t;

    	const block = {
    		c: function create() {
    			h1 = element("h1");
    			t = text(t_value);
    			attr_dev(h1, "class", "svelte-ajoz6");
    			add_location(h1, file$8, 35, 12, 697);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h1, anchor);
    			append_dev(h1, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*phrasesObject*/ 1 && t_value !== (t_value = /*phrasesObject*/ ctx[0].backPhrase + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$2.name,
    		type: "else",
    		source: "(35:8) {:else}",
    		ctx
    	});

    	return block;
    }

    // (33:8) {#if isMobile}
    function create_if_block$3(ctx) {
    	let h3;
    	let t_value = /*phrasesObject*/ ctx[0].backPhrase + "";
    	let t;

    	const block = {
    		c: function create() {
    			h3 = element("h3");
    			t = text(t_value);
    			attr_dev(h3, "class", "svelte-ajoz6");
    			add_location(h3, file$8, 33, 12, 631);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h3, anchor);
    			append_dev(h3, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*phrasesObject*/ 1 && t_value !== (t_value = /*phrasesObject*/ ctx[0].backPhrase + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h3);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(33:8) {#if isMobile}",
    		ctx
    	});

    	return block;
    }

    // (32:4) 
    function create_back_slot$1(ctx) {
    	let div;

    	function select_block_type(ctx, dirty) {
    		if (/*isMobile*/ ctx[2]) return create_if_block$3;
    		return create_else_block$2;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if_block.c();
    			attr_dev(div, "slot", "back");
    			add_location(div, file$8, 31, 4, 576);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if_block.m(div, null);
    		},
    		p: function update(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div, null);
    				}
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_back_slot$1.name,
    		type: "slot",
    		source: "(32:4) ",
    		ctx
    	});

    	return block;
    }

    function create_fragment$9(ctx) {
    	let card;
    	let current;

    	card = new Card({
    			props: {
    				holdFlip: /*holdFlip*/ ctx[1],
    				isMobile: /*isMobile*/ ctx[2],
    				$$slots: {
    					back: [create_back_slot$1],
    					front: [create_front_slot$1]
    				},
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(card.$$.fragment);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(card, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const card_changes = {};
    			if (dirty & /*holdFlip*/ 2) card_changes.holdFlip = /*holdFlip*/ ctx[1];
    			if (dirty & /*isMobile*/ 4) card_changes.isMobile = /*isMobile*/ ctx[2];

    			if (dirty & /*$$scope, phrasesObject, isMobile*/ 13) {
    				card_changes.$$scope = { dirty, ctx };
    			}

    			card.$set(card_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(card.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(card.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(card, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$9.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("TextPhrase", slots, []);
    	let { phrasesObject } = $$props;
    	let { holdFlip } = $$props;
    	let { isMobile } = $$props;
    	const writable_props = ["phrasesObject", "holdFlip", "isMobile"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<TextPhrase> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("phrasesObject" in $$props) $$invalidate(0, phrasesObject = $$props.phrasesObject);
    		if ("holdFlip" in $$props) $$invalidate(1, holdFlip = $$props.holdFlip);
    		if ("isMobile" in $$props) $$invalidate(2, isMobile = $$props.isMobile);
    	};

    	$$self.$capture_state = () => ({ Card, phrasesObject, holdFlip, isMobile });

    	$$self.$inject_state = $$props => {
    		if ("phrasesObject" in $$props) $$invalidate(0, phrasesObject = $$props.phrasesObject);
    		if ("holdFlip" in $$props) $$invalidate(1, holdFlip = $$props.holdFlip);
    		if ("isMobile" in $$props) $$invalidate(2, isMobile = $$props.isMobile);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [phrasesObject, holdFlip, isMobile];
    }

    class TextPhrase extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$9, create_fragment$9, safe_not_equal, {
    			phrasesObject: 0,
    			holdFlip: 1,
    			isMobile: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TextPhrase",
    			options,
    			id: create_fragment$9.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*phrasesObject*/ ctx[0] === undefined && !("phrasesObject" in props)) {
    			console.warn("<TextPhrase> was created without expected prop 'phrasesObject'");
    		}

    		if (/*holdFlip*/ ctx[1] === undefined && !("holdFlip" in props)) {
    			console.warn("<TextPhrase> was created without expected prop 'holdFlip'");
    		}

    		if (/*isMobile*/ ctx[2] === undefined && !("isMobile" in props)) {
    			console.warn("<TextPhrase> was created without expected prop 'isMobile'");
    		}
    	}

    	get phrasesObject() {
    		throw new Error("<TextPhrase>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set phrasesObject(value) {
    		throw new Error("<TextPhrase>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get holdFlip() {
    		throw new Error("<TextPhrase>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set holdFlip(value) {
    		throw new Error("<TextPhrase>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isMobile() {
    		throw new Error("<TextPhrase>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isMobile(value) {
    		throw new Error("<TextPhrase>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* node_modules\svelte-icons\fa\FaRegCircle.svelte generated by Svelte v3.38.3 */
    const file$7 = "node_modules\\svelte-icons\\fa\\FaRegCircle.svelte";

    // (4:8) <IconBase viewBox="0 0 512 512" {...$$props}>
    function create_default_slot$4(ctx) {
    	let path;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm0 448c-110.5 0-200-89.5-200-200S145.5 56 256 56s200 89.5 200 200-89.5 200-200 200z");
    			add_location(path, file$7, 4, 10, 153);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$4.name,
    		type: "slot",
    		source: "(4:8) <IconBase viewBox=\\\"0 0 512 512\\\" {...$$props}>",
    		ctx
    	});

    	return block;
    }

    function create_fragment$8(ctx) {
    	let iconbase;
    	let current;
    	const iconbase_spread_levels = [{ viewBox: "0 0 512 512" }, /*$$props*/ ctx[0]];

    	let iconbase_props = {
    		$$slots: { default: [create_default_slot$4] },
    		$$scope: { ctx }
    	};

    	for (let i = 0; i < iconbase_spread_levels.length; i += 1) {
    		iconbase_props = assign(iconbase_props, iconbase_spread_levels[i]);
    	}

    	iconbase = new IconBase({ props: iconbase_props, $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(iconbase.$$.fragment);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(iconbase, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const iconbase_changes = (dirty & /*$$props*/ 1)
    			? get_spread_update(iconbase_spread_levels, [iconbase_spread_levels[0], get_spread_object(/*$$props*/ ctx[0])])
    			: {};

    			if (dirty & /*$$scope*/ 2) {
    				iconbase_changes.$$scope = { dirty, ctx };
    			}

    			iconbase.$set(iconbase_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(iconbase.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(iconbase.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(iconbase, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$8.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$8($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("FaRegCircle", slots, []);

    	$$self.$$set = $$new_props => {
    		$$invalidate(0, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    	};

    	$$self.$capture_state = () => ({ IconBase });

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(0, $$props = assign(assign({}, $$props), $$new_props));
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$props = exclude_internal_props($$props);
    	return [$$props];
    }

    class FaRegCircle extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$8, create_fragment$8, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "FaRegCircle",
    			options,
    			id: create_fragment$8.name
    		});
    	}
    }

    /* node_modules\svelte-icons\fa\FaWindowClose.svelte generated by Svelte v3.38.3 */
    const file$6 = "node_modules\\svelte-icons\\fa\\FaWindowClose.svelte";

    // (4:8) <IconBase viewBox="0 0 512 512" {...$$props}>
    function create_default_slot$3(ctx) {
    	let path;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M464 32H48C21.5 32 0 53.5 0 80v352c0 26.5 21.5 48 48 48h416c26.5 0 48-21.5 48-48V80c0-26.5-21.5-48-48-48zm-83.6 290.5c4.8 4.8 4.8 12.6 0 17.4l-40.5 40.5c-4.8 4.8-12.6 4.8-17.4 0L256 313.3l-66.5 67.1c-4.8 4.8-12.6 4.8-17.4 0l-40.5-40.5c-4.8-4.8-4.8-12.6 0-17.4l67.1-66.5-67.1-66.5c-4.8-4.8-4.8-12.6 0-17.4l40.5-40.5c4.8-4.8 12.6-4.8 17.4 0l66.5 67.1 66.5-67.1c4.8-4.8 12.6-4.8 17.4 0l40.5 40.5c4.8 4.8 4.8 12.6 0 17.4L313.3 256l67.1 66.5z");
    			add_location(path, file$6, 4, 10, 153);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$3.name,
    		type: "slot",
    		source: "(4:8) <IconBase viewBox=\\\"0 0 512 512\\\" {...$$props}>",
    		ctx
    	});

    	return block;
    }

    function create_fragment$7(ctx) {
    	let iconbase;
    	let current;
    	const iconbase_spread_levels = [{ viewBox: "0 0 512 512" }, /*$$props*/ ctx[0]];

    	let iconbase_props = {
    		$$slots: { default: [create_default_slot$3] },
    		$$scope: { ctx }
    	};

    	for (let i = 0; i < iconbase_spread_levels.length; i += 1) {
    		iconbase_props = assign(iconbase_props, iconbase_spread_levels[i]);
    	}

    	iconbase = new IconBase({ props: iconbase_props, $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(iconbase.$$.fragment);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(iconbase, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const iconbase_changes = (dirty & /*$$props*/ 1)
    			? get_spread_update(iconbase_spread_levels, [iconbase_spread_levels[0], get_spread_object(/*$$props*/ ctx[0])])
    			: {};

    			if (dirty & /*$$scope*/ 2) {
    				iconbase_changes.$$scope = { dirty, ctx };
    			}

    			iconbase.$set(iconbase_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(iconbase.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(iconbase.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(iconbase, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("FaWindowClose", slots, []);

    	$$self.$$set = $$new_props => {
    		$$invalidate(0, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    	};

    	$$self.$capture_state = () => ({ IconBase });

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(0, $$props = assign(assign({}, $$props), $$new_props));
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$props = exclude_internal_props($$props);
    	return [$$props];
    }

    class FaWindowClose extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "FaWindowClose",
    			options,
    			id: create_fragment$7.name
    		});
    	}
    }

    /* node_modules\svelte-icons\fa\FaCheckCircle.svelte generated by Svelte v3.38.3 */
    const file$5 = "node_modules\\svelte-icons\\fa\\FaCheckCircle.svelte";

    // (4:8) <IconBase viewBox="0 0 512 512" {...$$props}>
    function create_default_slot$2(ctx) {
    	let path;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", "M504 256c0 136.967-111.033 248-248 248S8 392.967 8 256 119.033 8 256 8s248 111.033 248 248zM227.314 387.314l184-184c6.248-6.248 6.248-16.379 0-22.627l-22.627-22.627c-6.248-6.249-16.379-6.249-22.628 0L216 308.118l-70.059-70.059c-6.248-6.248-16.379-6.248-22.628 0l-22.627 22.627c-6.248 6.248-6.248 16.379 0 22.627l104 104c6.249 6.249 16.379 6.249 22.628.001z");
    			add_location(path, file$5, 4, 10, 153);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$2.name,
    		type: "slot",
    		source: "(4:8) <IconBase viewBox=\\\"0 0 512 512\\\" {...$$props}>",
    		ctx
    	});

    	return block;
    }

    function create_fragment$6(ctx) {
    	let iconbase;
    	let current;
    	const iconbase_spread_levels = [{ viewBox: "0 0 512 512" }, /*$$props*/ ctx[0]];

    	let iconbase_props = {
    		$$slots: { default: [create_default_slot$2] },
    		$$scope: { ctx }
    	};

    	for (let i = 0; i < iconbase_spread_levels.length; i += 1) {
    		iconbase_props = assign(iconbase_props, iconbase_spread_levels[i]);
    	}

    	iconbase = new IconBase({ props: iconbase_props, $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(iconbase.$$.fragment);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(iconbase, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const iconbase_changes = (dirty & /*$$props*/ 1)
    			? get_spread_update(iconbase_spread_levels, [iconbase_spread_levels[0], get_spread_object(/*$$props*/ ctx[0])])
    			: {};

    			if (dirty & /*$$scope*/ 2) {
    				iconbase_changes.$$scope = { dirty, ctx };
    			}

    			iconbase.$set(iconbase_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(iconbase.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(iconbase.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(iconbase, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("FaCheckCircle", slots, []);

    	$$self.$$set = $$new_props => {
    		$$invalidate(0, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    	};

    	$$self.$capture_state = () => ({ IconBase });

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(0, $$props = assign(assign({}, $$props), $$new_props));
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$props = exclude_internal_props($$props);
    	return [$$props];
    }

    class FaCheckCircle extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "FaCheckCircle",
    			options,
    			id: create_fragment$6.name
    		});
    	}
    }

    /* src\MultiChoicePhrase.svelte generated by Svelte v3.38.3 */
    const file$4 = "src\\MultiChoicePhrase.svelte";

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[7] = list[i];
    	return child_ctx;
    }

    // (105:16) {:else}
    function create_else_block_1(ctx) {
    	let h3;
    	let t_value = /*phrasesObject*/ ctx[0].frontPhrase + "";
    	let t;

    	const block = {
    		c: function create() {
    			h3 = element("h3");
    			t = text(t_value);
    			attr_dev(h3, "class", "svelte-ht4s1g");
    			add_location(h3, file$4, 105, 16, 2877);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, h3, anchor);
    			append_dev(h3, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*phrasesObject*/ 1 && t_value !== (t_value = /*phrasesObject*/ ctx[0].frontPhrase + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h3);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block_1.name,
    		type: "else",
    		source: "(105:16) {:else}",
    		ctx
    	});

    	return block;
    }

    // (103:16) {#if isMobile}
    function create_if_block_2$1(ctx) {
    	let span;
    	let t_value = /*phrasesObject*/ ctx[0].frontPhrase + "";
    	let t;

    	const block = {
    		c: function create() {
    			span = element("span");
    			t = text(t_value);
    			add_location(span, file$4, 103, 20, 2794);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    			append_dev(span, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*phrasesObject*/ 1 && t_value !== (t_value = /*phrasesObject*/ ctx[0].frontPhrase + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$1.name,
    		type: "if",
    		source: "(103:16) {#if isMobile}",
    		ctx
    	});

    	return block;
    }

    // (123:32) {:else}
    function create_else_block$1(ctx) {
    	let faregcircle;
    	let current;
    	faregcircle = new FaRegCircle({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(faregcircle.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(faregcircle, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(faregcircle.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(faregcircle.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(faregcircle, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$1.name,
    		type: "else",
    		source: "(123:32) {:else}",
    		ctx
    	});

    	return block;
    }

    // (121:74) 
    function create_if_block_1$2(ctx) {
    	let fawindowclose;
    	let current;
    	fawindowclose = new FaWindowClose({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(fawindowclose.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(fawindowclose, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(fawindowclose.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(fawindowclose.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(fawindowclose, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$2.name,
    		type: "if",
    		source: "(121:74) ",
    		ctx
    	});

    	return block;
    }

    // (119:32) {#if hasChosen && isCorrect(answer)}
    function create_if_block$2(ctx) {
    	let facheckcircle;
    	let current;
    	facheckcircle = new FaCheckCircle({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(facheckcircle.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(facheckcircle, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(facheckcircle.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(facheckcircle.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(facheckcircle, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(119:32) {#if hasChosen && isCorrect(answer)}",
    		ctx
    	});

    	return block;
    }

    // (112:20) {#each phrasesObject.Answers as answer}
    function create_each_block$2(ctx) {
    	let li;
    	let span0;
    	let show_if;
    	let show_if_1;
    	let current_block_type_index;
    	let if_block;
    	let t0;
    	let span1;
    	let t1_value = /*answer*/ ctx[7] + "";
    	let t1;
    	let t2;
    	let current;
    	let mounted;
    	let dispose;
    	const if_block_creators = [create_if_block$2, create_if_block_1$2, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (dirty & /*hasChosen, phrasesObject*/ 9) show_if = !!(/*hasChosen*/ ctx[3] && /*isCorrect*/ ctx[5](/*answer*/ ctx[7]));
    		if (show_if) return 0;
    		if (dirty & /*hasChosen, phrasesObject*/ 9) show_if_1 = !!(/*hasChosen*/ ctx[3] && !/*isCorrect*/ ctx[5](/*answer*/ ctx[7]));
    		if (show_if_1) return 1;
    		return 2;
    	}

    	current_block_type_index = select_block_type_1(ctx, -1);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			li = element("li");
    			span0 = element("span");
    			if_block.c();
    			t0 = space();
    			span1 = element("span");
    			t1 = text(t1_value);
    			t2 = space();
    			attr_dev(span0, "class", "icon svelte-ht4s1g");
    			toggle_class(span0, "icon-answer", !/*isMobile*/ ctx[2]);
    			toggle_class(span0, "icon-mobile-answer", /*isMobile*/ ctx[2]);
    			add_location(span0, file$4, 116, 28, 3413);
    			attr_dev(span1, "class", "svelte-ht4s1g");
    			toggle_class(span1, "answer-option", !/*isMobile*/ ctx[2]);
    			toggle_class(span1, "answer-option-mobile", /*isMobile*/ ctx[2]);
    			add_location(span1, file$4, 127, 28, 4019);
    			attr_dev(li, "class", "lx-collection-item svelte-ht4s1g");
    			toggle_class(li, "is-correct", /*hasChosen*/ ctx[3] && /*isCorrect*/ ctx[5](/*answer*/ ctx[7]));
    			toggle_class(li, "is-incorrect", /*hasChosen*/ ctx[3] && !/*isCorrect*/ ctx[5](/*answer*/ ctx[7]));
    			add_location(li, file$4, 112, 24, 3142);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, span0);
    			if_blocks[current_block_type_index].m(span0, null);
    			append_dev(li, t0);
    			append_dev(li, span1);
    			append_dev(span1, t1);
    			append_dev(li, t2);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(
    					li,
    					"click",
    					function () {
    						if (is_function(/*checkAnswer*/ ctx[4](/*answer*/ ctx[7]))) /*checkAnswer*/ ctx[4](/*answer*/ ctx[7]).apply(this, arguments);
    					},
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_1(ctx, dirty);

    			if (current_block_type_index !== previous_block_index) {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(span0, null);
    			}

    			if (dirty & /*isMobile*/ 4) {
    				toggle_class(span0, "icon-answer", !/*isMobile*/ ctx[2]);
    			}

    			if (dirty & /*isMobile*/ 4) {
    				toggle_class(span0, "icon-mobile-answer", /*isMobile*/ ctx[2]);
    			}

    			if ((!current || dirty & /*phrasesObject*/ 1) && t1_value !== (t1_value = /*answer*/ ctx[7] + "")) set_data_dev(t1, t1_value);

    			if (dirty & /*isMobile*/ 4) {
    				toggle_class(span1, "answer-option", !/*isMobile*/ ctx[2]);
    			}

    			if (dirty & /*isMobile*/ 4) {
    				toggle_class(span1, "answer-option-mobile", /*isMobile*/ ctx[2]);
    			}

    			if (dirty & /*hasChosen, isCorrect, phrasesObject*/ 41) {
    				toggle_class(li, "is-correct", /*hasChosen*/ ctx[3] && /*isCorrect*/ ctx[5](/*answer*/ ctx[7]));
    			}

    			if (dirty & /*hasChosen, isCorrect, phrasesObject*/ 41) {
    				toggle_class(li, "is-incorrect", /*hasChosen*/ ctx[3] && !/*isCorrect*/ ctx[5](/*answer*/ ctx[7]));
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			if_blocks[current_block_type_index].d();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$2.name,
    		type: "each",
    		source: "(112:20) {#each phrasesObject.Answers as answer}",
    		ctx
    	});

    	return block;
    }

    // (100:4) 
    function create_front_slot(ctx) {
    	let div3;
    	let div2;
    	let div0;
    	let t;
    	let div1;
    	let ul;
    	let current;

    	function select_block_type(ctx, dirty) {
    		if (/*isMobile*/ ctx[2]) return create_if_block_2$1;
    		return create_else_block_1;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);
    	let each_value = /*phrasesObject*/ ctx[0].Answers;
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			div3 = element("div");
    			div2 = element("div");
    			div0 = element("div");
    			if_block.c();
    			t = space();
    			div1 = element("div");
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(div0, "class", "lx-column svelte-ht4s1g");
    			toggle_class(div0, "front-phrase-mobile", /*isMobile*/ ctx[2]);
    			add_location(div0, file$4, 101, 12, 2680);
    			attr_dev(ul, "class", "lx-collection");
    			add_location(ul, file$4, 110, 16, 3029);
    			attr_dev(div1, "class", "lx-column");
    			add_location(div1, file$4, 109, 12, 2988);
    			attr_dev(div2, "class", "lx-row");
    			add_location(div2, file$4, 100, 8, 2646);
    			attr_dev(div3, "slot", "front");
    			add_location(div3, file$4, 99, 4, 2618);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div3, anchor);
    			append_dev(div3, div2);
    			append_dev(div2, div0);
    			if_block.m(div0, null);
    			append_dev(div2, t);
    			append_dev(div2, div1);
    			append_dev(div1, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(ul, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div0, null);
    				}
    			}

    			if (dirty & /*isMobile*/ 4) {
    				toggle_class(div0, "front-phrase-mobile", /*isMobile*/ ctx[2]);
    			}

    			if (dirty & /*hasChosen, isCorrect, phrasesObject, checkAnswer, isMobile*/ 61) {
    				each_value = /*phrasesObject*/ ctx[0].Answers;
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(ul, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div3);
    			if_block.d();
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_front_slot.name,
    		type: "slot",
    		source: "(100:4) ",
    		ctx
    	});

    	return block;
    }

    // (136:4) 
    function create_back_slot(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			attr_dev(div, "slot", "back");
    			add_location(div, file$4, 135, 4, 4276);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_back_slot.name,
    		type: "slot",
    		source: "(136:4) ",
    		ctx
    	});

    	return block;
    }

    function create_fragment$5(ctx) {
    	let card;
    	let current;

    	card = new Card({
    			props: {
    				holdFlip: /*holdFlip*/ ctx[1],
    				isMobile: /*isMobile*/ ctx[2],
    				$$slots: {
    					back: [create_back_slot],
    					front: [create_front_slot]
    				},
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(card.$$.fragment);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			mount_component(card, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const card_changes = {};
    			if (dirty & /*holdFlip*/ 2) card_changes.holdFlip = /*holdFlip*/ ctx[1];
    			if (dirty & /*isMobile*/ 4) card_changes.isMobile = /*isMobile*/ ctx[2];

    			if (dirty & /*$$scope, phrasesObject, hasChosen, isMobile*/ 1037) {
    				card_changes.$$scope = { dirty, ctx };
    			}

    			card.$set(card_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(card.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(card.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(card, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("MultiChoicePhrase", slots, []);
    	let { phrasesObject } = $$props;
    	let { holdFlip } = $$props;
    	let { isMobile } = $$props;
    	let hasChosen;
    	const newQuestionDispatcher = createEventDispatcher();

    	function checkAnswer(answer) {
    		$$invalidate(3, hasChosen = true);

    		if (isCorrect(answer)) {
    			playLocalAudio("good-answer.wav");

    			newQuestionDispatcher("newQuestion", {
    				isCorrect: true,
    				chosenAnswer: answer,
    				question: phrasesObject.frontPhrase,
    				correctAnswer: phrasesObject.correctPhrase
    			});
    		} else {
    			playLocalAudio("bad-answer.wav");

    			newQuestionDispatcher("newQuestion", {
    				isCorrect: false,
    				chosenAnswer: answer,
    				question: phrasesObject.frontPhrase,
    				correctAnswer: phrasesObject.correctPhrase
    			});
    		}
    	}

    	function isCorrect(answer) {
    		return answer === phrasesObject.correctPhrase;
    	}

    	onMount(() => {
    		$$invalidate(0, phrasesObject.Answers = shuffle(phrasesObject.Answers), phrasesObject);
    	});

    	const writable_props = ["phrasesObject", "holdFlip", "isMobile"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<MultiChoicePhrase> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("phrasesObject" in $$props) $$invalidate(0, phrasesObject = $$props.phrasesObject);
    		if ("holdFlip" in $$props) $$invalidate(1, holdFlip = $$props.holdFlip);
    		if ("isMobile" in $$props) $$invalidate(2, isMobile = $$props.isMobile);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		onMount,
    		Card,
    		FaRegCircle,
    		FaWindowClose,
    		FaCheckCircle,
    		playLocalAudio,
    		shuffle,
    		phrasesObject,
    		holdFlip,
    		isMobile,
    		hasChosen,
    		newQuestionDispatcher,
    		checkAnswer,
    		isCorrect
    	});

    	$$self.$inject_state = $$props => {
    		if ("phrasesObject" in $$props) $$invalidate(0, phrasesObject = $$props.phrasesObject);
    		if ("holdFlip" in $$props) $$invalidate(1, holdFlip = $$props.holdFlip);
    		if ("isMobile" in $$props) $$invalidate(2, isMobile = $$props.isMobile);
    		if ("hasChosen" in $$props) $$invalidate(3, hasChosen = $$props.hasChosen);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [phrasesObject, holdFlip, isMobile, hasChosen, checkAnswer, isCorrect];
    }

    class MultiChoicePhrase extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$5, create_fragment$5, safe_not_equal, {
    			phrasesObject: 0,
    			holdFlip: 1,
    			isMobile: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "MultiChoicePhrase",
    			options,
    			id: create_fragment$5.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*phrasesObject*/ ctx[0] === undefined && !("phrasesObject" in props)) {
    			console.warn("<MultiChoicePhrase> was created without expected prop 'phrasesObject'");
    		}

    		if (/*holdFlip*/ ctx[1] === undefined && !("holdFlip" in props)) {
    			console.warn("<MultiChoicePhrase> was created without expected prop 'holdFlip'");
    		}

    		if (/*isMobile*/ ctx[2] === undefined && !("isMobile" in props)) {
    			console.warn("<MultiChoicePhrase> was created without expected prop 'isMobile'");
    		}
    	}

    	get phrasesObject() {
    		throw new Error("<MultiChoicePhrase>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set phrasesObject(value) {
    		throw new Error("<MultiChoicePhrase>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get holdFlip() {
    		throw new Error("<MultiChoicePhrase>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set holdFlip(value) {
    		throw new Error("<MultiChoicePhrase>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isMobile() {
    		throw new Error("<MultiChoicePhrase>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isMobile(value) {
    		throw new Error("<MultiChoicePhrase>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\PhraseCarousel.svelte generated by Svelte v3.38.3 */
    const file$3 = "src\\PhraseCarousel.svelte";

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[9] = list[i];
    	return child_ctx;
    }

    // (68:4) {:else}
    function create_else_block(ctx) {
    	let carousel;
    	let current;

    	carousel = new Carousel({
    			props: {
    				$$slots: {
    					next: [
    						create_next_slot,
    						({ showPrevPage, showNextPage }) => ({ 7: showPrevPage, 8: showNextPage }),
    						({ showPrevPage, showNextPage }) => (showPrevPage ? 128 : 0) | (showNextPage ? 256 : 0)
    					],
    					prev: [
    						create_prev_slot,
    						({ showPrevPage, showNextPage }) => ({ 7: showPrevPage, 8: showNextPage }),
    						({ showPrevPage, showNextPage }) => (showPrevPage ? 128 : 0) | (showNextPage ? 256 : 0)
    					],
    					default: [
    						create_default_slot$1,
    						({ showPrevPage, showNextPage }) => ({ 7: showPrevPage, 8: showNextPage }),
    						({ showPrevPage, showNextPage }) => (showPrevPage ? 128 : 0) | (showNextPage ? 256 : 0)
    					]
    				},
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	carousel.$on("pageChange", /*preventFlip*/ ctx[4]);

    	const block = {
    		c: function create() {
    			create_component(carousel.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(carousel, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const carousel_changes = {};

    			if (dirty & /*$$scope, isMobile, showNextPage, showPrevPage, trainingSets, chosenTrainingSet, holdFlip*/ 4495) {
    				carousel_changes.$$scope = { dirty, ctx };
    			}

    			carousel.$set(carousel_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(carousel.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(carousel.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(carousel, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(68:4) {:else}",
    		ctx
    	});

    	return block;
    }

    // (63:46) 
    function create_if_block_1$1(ctx) {
    	let div;
    	let wave;
    	let t0;
    	let h2;
    	let current;

    	wave = new Wave({
    			props: {
    				size: "60",
    				color: "#5a4ba5",
    				unit: "px",
    				duration: "1s"
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(wave.$$.fragment);
    			t0 = space();
    			h2 = element("h2");
    			h2.textContent = "Loading";
    			add_location(h2, file$3, 65, 12, 1961);
    			add_location(div, file$3, 63, 8, 1865);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(wave, div, null);
    			append_dev(div, t0);
    			append_dev(div, h2);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(wave.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(wave.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(wave);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(63:46) ",
    		ctx
    	});

    	return block;
    }

    // (61:4) {#if chosenTrainingSet === 'none'}
    function create_if_block$1(ctx) {
    	let span;

    	const block = {
    		c: function create() {
    			span = element("span");
    			span.textContent = "U kunt een trainingsSet selecteren in de top linkerkant van het scherm.";
    			add_location(span, file$3, 61, 12, 1723);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(61:4) {#if chosenTrainingSet === 'none'}",
    		ctx
    	});

    	return block;
    }

    // (85:57) 
    function create_if_block_4(ctx) {
    	let multichoicephrase;
    	let current;

    	multichoicephrase = new MultiChoicePhrase({
    			props: {
    				isMobile: /*isMobile*/ ctx[0],
    				holdFlip: true,
    				phrasesObject: /*phrase*/ ctx[9]
    			},
    			$$inline: true
    		});

    	multichoicephrase.$on("newQuestion", /*newQuestionEvent*/ ctx[5]);

    	const block = {
    		c: function create() {
    			create_component(multichoicephrase.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(multichoicephrase, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const multichoicephrase_changes = {};
    			if (dirty & /*isMobile*/ 1) multichoicephrase_changes.isMobile = /*isMobile*/ ctx[0];
    			if (dirty & /*trainingSets, chosenTrainingSet*/ 6) multichoicephrase_changes.phrasesObject = /*phrase*/ ctx[9];
    			multichoicephrase.$set(multichoicephrase_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(multichoicephrase.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(multichoicephrase.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(multichoicephrase, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4.name,
    		type: "if",
    		source: "(85:57) ",
    		ctx
    	});

    	return block;
    }

    // (83:49) 
    function create_if_block_3(ctx) {
    	let textphrase;
    	let current;

    	textphrase = new TextPhrase({
    			props: {
    				isMobile: /*isMobile*/ ctx[0],
    				holdFlip: /*holdFlip*/ ctx[3],
    				phrasesObject: /*phrase*/ ctx[9]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(textphrase.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(textphrase, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const textphrase_changes = {};
    			if (dirty & /*isMobile*/ 1) textphrase_changes.isMobile = /*isMobile*/ ctx[0];
    			if (dirty & /*holdFlip*/ 8) textphrase_changes.holdFlip = /*holdFlip*/ ctx[3];
    			if (dirty & /*trainingSets, chosenTrainingSet*/ 6) textphrase_changes.phrasesObject = /*phrase*/ ctx[9];
    			textphrase.$set(textphrase_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(textphrase.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(textphrase.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(textphrase, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(83:49) ",
    		ctx
    	});

    	return block;
    }

    // (81:16) {#if phrase.type === "audio"}
    function create_if_block_2(ctx) {
    	let audiophrase;
    	let current;

    	audiophrase = new AudioPhrase({
    			props: {
    				isMobile: /*isMobile*/ ctx[0],
    				holdFlip: /*holdFlip*/ ctx[3],
    				phrasesObject: /*phrase*/ ctx[9]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(audiophrase.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(audiophrase, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const audiophrase_changes = {};
    			if (dirty & /*isMobile*/ 1) audiophrase_changes.isMobile = /*isMobile*/ ctx[0];
    			if (dirty & /*holdFlip*/ 8) audiophrase_changes.holdFlip = /*holdFlip*/ ctx[3];
    			if (dirty & /*trainingSets, chosenTrainingSet*/ 6) audiophrase_changes.phrasesObject = /*phrase*/ ctx[9];
    			audiophrase.$set(audiophrase_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(audiophrase.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(audiophrase.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(audiophrase, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(81:16) {#if phrase.type === \\\"audio\\\"}",
    		ctx
    	});

    	return block;
    }

    // (79:12) {#each shuffle(trainingSets[chosenTrainingSet].data)                  .filter(da => da.type === "multi/choice") as phrase}
    function create_each_block$1(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_2, create_if_block_3, create_if_block_4];
    	const if_blocks = [];

    	function select_block_type_1(ctx, dirty) {
    		if (/*phrase*/ ctx[9].type === "audio") return 0;
    		if (/*phrase*/ ctx[9].type === "text") return 1;
    		if (/*phrase*/ ctx[9].type === "multi/choice") return 2;
    		return -1;
    	}

    	if (~(current_block_type_index = select_block_type_1(ctx))) {
    		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    	}

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].m(target, anchor);
    			}

    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type_1(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if (~current_block_type_index) {
    					if_blocks[current_block_type_index].p(ctx, dirty);
    				}
    			} else {
    				if (if_block) {
    					group_outros();

    					transition_out(if_blocks[previous_block_index], 1, 1, () => {
    						if_blocks[previous_block_index] = null;
    					});

    					check_outros();
    				}

    				if (~current_block_type_index) {
    					if_block = if_blocks[current_block_type_index];

    					if (!if_block) {
    						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    						if_block.c();
    					} else {
    						if_block.p(ctx, dirty);
    					}

    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				} else {
    					if_block = null;
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (~current_block_type_index) {
    				if_blocks[current_block_type_index].d(detaching);
    			}

    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(79:12) {#each shuffle(trainingSets[chosenTrainingSet].data)                  .filter(da => da.type === \\\"multi/choice\\\") as phrase}",
    		ctx
    	});

    	return block;
    }

    // (69:4) <Carousel          let:showPrevPage          let:showNextPage          on:pageChange={preventFlip}          >
    function create_default_slot$1(ctx) {
    	let each_1_anchor;
    	let current;
    	let each_value = shuffle(/*trainingSets*/ ctx[1][/*chosenTrainingSet*/ ctx[2]].data).filter(func);
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*isMobile, holdFlip, shuffle, trainingSets, chosenTrainingSet, newQuestionEvent*/ 47) {
    				each_value = shuffle(/*trainingSets*/ ctx[1][/*chosenTrainingSet*/ ctx[2]].data).filter(func);
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$1.name,
    		type: "slot",
    		source: "(69:4) <Carousel          let:showPrevPage          let:showNextPage          on:pageChange={preventFlip}          >",
    		ctx
    	});

    	return block;
    }

    // (74:8) 
    function create_prev_slot(ctx) {
    	let div;
    	let faangleleft;
    	let current;
    	let mounted;
    	let dispose;
    	faangleleft = new FaAngleLeft({ $$inline: true });

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(faangleleft.$$.fragment);
    			attr_dev(div, "slot", "prev");
    			attr_dev(div, "class", "svelte-5xjf9e");
    			toggle_class(div, "mobileIcon", /*isMobile*/ ctx[0]);
    			toggle_class(div, "icon", !/*isMobile*/ ctx[0]);
    			add_location(div, file$3, 73, 8, 2135);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(faangleleft, div, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(
    					div,
    					"click",
    					function () {
    						if (is_function(/*showPrevPage*/ ctx[7])) /*showPrevPage*/ ctx[7].apply(this, arguments);
    					},
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*isMobile*/ 1) {
    				toggle_class(div, "mobileIcon", /*isMobile*/ ctx[0]);
    			}

    			if (dirty & /*isMobile*/ 1) {
    				toggle_class(div, "icon", !/*isMobile*/ ctx[0]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(faangleleft.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(faangleleft.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(faangleleft);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_prev_slot.name,
    		type: "slot",
    		source: "(74:8) ",
    		ctx
    	});

    	return block;
    }

    // (90:12) 
    function create_next_slot(ctx) {
    	let div;
    	let faangleright;
    	let current;
    	let mounted;
    	let dispose;
    	faangleright = new FaAngleRight({ $$inline: true });

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(faangleright.$$.fragment);
    			attr_dev(div, "slot", "next");
    			attr_dev(div, "id", "NextPageCarousel");
    			attr_dev(div, "class", "svelte-5xjf9e");
    			toggle_class(div, "mobileIcon", /*isMobile*/ ctx[0]);
    			toggle_class(div, "icon", !/*isMobile*/ ctx[0]);
    			add_location(div, file$3, 89, 12, 2981);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(faangleright, div, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(
    					div,
    					"click",
    					function () {
    						if (is_function(/*showNextPage*/ ctx[8])) /*showNextPage*/ ctx[8].apply(this, arguments);
    					},
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty & /*isMobile*/ 1) {
    				toggle_class(div, "mobileIcon", /*isMobile*/ ctx[0]);
    			}

    			if (dirty & /*isMobile*/ 1) {
    				toggle_class(div, "icon", !/*isMobile*/ ctx[0]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(faangleright.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(faangleright.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(faangleright);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_next_slot.name,
    		type: "slot",
    		source: "(90:12) ",
    		ctx
    	});

    	return block;
    }

    function create_fragment$4(ctx) {
    	let div;
    	let current_block_type_index;
    	let if_block;
    	let current;
    	const if_block_creators = [create_if_block$1, create_if_block_1$1, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*chosenTrainingSet*/ ctx[2] === "none") return 0;
    		if (/*chosenTrainingSet*/ ctx[2] === "loading") return 1;
    		return 2;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if_block.c();
    			attr_dev(div, "class", "carousel svelte-5xjf9e");
    			add_location(div, file$3, 59, 0, 1647);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if_blocks[current_block_type_index].m(div, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				} else {
    					if_block.p(ctx, dirty);
    				}

    				transition_in(if_block, 1);
    				if_block.m(div, null);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if_blocks[current_block_type_index].d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const func = da => da.type === "multi/choice";

    function instance$4($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("PhraseCarousel", slots, []);
    	let holdFlip = false;
    	const newQuestionDispatcher = createEventDispatcher();
    	let { isMobile } = $$props;
    	let { trainingSets } = $$props;
    	let { chosenTrainingSet } = $$props;

    	function preventFlip() {
    		$$invalidate(3, holdFlip = true);
    		setTimeout(() => $$invalidate(3, holdFlip = false), 500);
    	}

    	function newQuestionEvent(eventData) {
    		var nextPageElement = document.getElementById("NextPageCarousel");

    		setTimeout(
    			function () {
    				nextPageElement.click();
    			},
    			500
    		);

    		newQuestionDispatcher("newQuestion", eventData);
    	}

    	const writable_props = ["isMobile", "trainingSets", "chosenTrainingSet"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<PhraseCarousel> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("isMobile" in $$props) $$invalidate(0, isMobile = $$props.isMobile);
    		if ("trainingSets" in $$props) $$invalidate(1, trainingSets = $$props.trainingSets);
    		if ("chosenTrainingSet" in $$props) $$invalidate(2, chosenTrainingSet = $$props.chosenTrainingSet);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		shuffle,
    		Wave,
    		Carousel,
    		FaAngleRight,
    		FaAngleLeft,
    		AudioPhrase,
    		TextPhrase,
    		MultiChoicePhrase,
    		holdFlip,
    		newQuestionDispatcher,
    		isMobile,
    		trainingSets,
    		chosenTrainingSet,
    		preventFlip,
    		newQuestionEvent
    	});

    	$$self.$inject_state = $$props => {
    		if ("holdFlip" in $$props) $$invalidate(3, holdFlip = $$props.holdFlip);
    		if ("isMobile" in $$props) $$invalidate(0, isMobile = $$props.isMobile);
    		if ("trainingSets" in $$props) $$invalidate(1, trainingSets = $$props.trainingSets);
    		if ("chosenTrainingSet" in $$props) $$invalidate(2, chosenTrainingSet = $$props.chosenTrainingSet);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		isMobile,
    		trainingSets,
    		chosenTrainingSet,
    		holdFlip,
    		preventFlip,
    		newQuestionEvent
    	];
    }

    class PhraseCarousel extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {
    			isMobile: 0,
    			trainingSets: 1,
    			chosenTrainingSet: 2
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "PhraseCarousel",
    			options,
    			id: create_fragment$4.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*isMobile*/ ctx[0] === undefined && !("isMobile" in props)) {
    			console.warn("<PhraseCarousel> was created without expected prop 'isMobile'");
    		}

    		if (/*trainingSets*/ ctx[1] === undefined && !("trainingSets" in props)) {
    			console.warn("<PhraseCarousel> was created without expected prop 'trainingSets'");
    		}

    		if (/*chosenTrainingSet*/ ctx[2] === undefined && !("chosenTrainingSet" in props)) {
    			console.warn("<PhraseCarousel> was created without expected prop 'chosenTrainingSet'");
    		}
    	}

    	get isMobile() {
    		throw new Error("<PhraseCarousel>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isMobile(value) {
    		throw new Error("<PhraseCarousel>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get trainingSets() {
    		throw new Error("<PhraseCarousel>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set trainingSets(value) {
    		throw new Error("<PhraseCarousel>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get chosenTrainingSet() {
    		throw new Error("<PhraseCarousel>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set chosenTrainingSet(value) {
    		throw new Error("<PhraseCarousel>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\MediaQuery.svelte generated by Svelte v3.38.3 */
    const get_default_slot_changes = dirty => ({ matches: dirty & /*matches*/ 1 });
    const get_default_slot_context = ctx => ({ matches: /*matches*/ ctx[0] });

    function create_fragment$3(ctx) {
    	let current;
    	const default_slot_template = /*#slots*/ ctx[4].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], get_default_slot_context);

    	const block = {
    		c: function create() {
    			if (default_slot) default_slot.c();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (default_slot) {
    				default_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && (!current || dirty & /*$$scope, matches*/ 9)) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[3], !current ? -1 : dirty, get_default_slot_changes, get_default_slot_context);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("MediaQuery", slots, ['default']);
    	let { query } = $$props;
    	let mql;
    	let mqlListener;
    	let wasMounted = false;
    	let matches = false;

    	onMount(() => {
    		$$invalidate(2, wasMounted = true);

    		return () => {
    			removeActiveListener();
    		};
    	});

    	function addNewListener(query) {
    		mql = window.matchMedia(query);
    		mqlListener = v => $$invalidate(0, matches = v.matches);
    		mql.addListener(mqlListener);
    		$$invalidate(0, matches = mql.matches);
    	}

    	function removeActiveListener() {
    		if (mql && mqlListener) {
    			mql.removeListener(mqlListener);
    		}
    	}

    	const writable_props = ["query"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<MediaQuery> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("query" in $$props) $$invalidate(1, query = $$props.query);
    		if ("$$scope" in $$props) $$invalidate(3, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		query,
    		mql,
    		mqlListener,
    		wasMounted,
    		matches,
    		addNewListener,
    		removeActiveListener
    	});

    	$$self.$inject_state = $$props => {
    		if ("query" in $$props) $$invalidate(1, query = $$props.query);
    		if ("mql" in $$props) mql = $$props.mql;
    		if ("mqlListener" in $$props) mqlListener = $$props.mqlListener;
    		if ("wasMounted" in $$props) $$invalidate(2, wasMounted = $$props.wasMounted);
    		if ("matches" in $$props) $$invalidate(0, matches = $$props.matches);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*wasMounted, query*/ 6) {
    			{
    				if (wasMounted) {
    					removeActiveListener();
    					addNewListener(query);
    				}
    			}
    		}
    	};

    	return [matches, query, wasMounted, $$scope, slots];
    }

    class MediaQuery extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { query: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "MediaQuery",
    			options,
    			id: create_fragment$3.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*query*/ ctx[1] === undefined && !("query" in props)) {
    			console.warn("<MediaQuery> was created without expected prop 'query'");
    		}
    	}

    	get query() {
    		throw new Error("<MediaQuery>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set query(value) {
    		throw new Error("<MediaQuery>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\Progress.svelte generated by Svelte v3.38.3 */
    const file$2 = "src\\Progress.svelte";

    function create_fragment$2(ctx) {
    	let progress_1;

    	const block = {
    		c: function create() {
    			progress_1 = element("progress");
    			progress_1.value = /*$progress*/ ctx[1];
    			attr_dev(progress_1, "class", "svelte-mpi2gg");
    			add_location(progress_1, file$2, 20, 0, 348);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, progress_1, anchor);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*$progress*/ 2) {
    				prop_dev(progress_1, "value", /*$progress*/ ctx[1]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(progress_1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let $progress,
    		$$unsubscribe_progress = noop,
    		$$subscribe_progress = () => ($$unsubscribe_progress(), $$unsubscribe_progress = subscribe(progress, $$value => $$invalidate(1, $progress = $$value)), progress);

    	$$self.$$.on_destroy.push(() => $$unsubscribe_progress());
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Progress", slots, []);

    	function setPercentage(percentage) {
    		progress.set(percentage);
    	}

    	const progress = tweened(0, { duration: 400, easing: cubicOut });
    	validate_store(progress, "progress");
    	$$subscribe_progress();
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Progress> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		tweened,
    		cubicOut,
    		setPercentage,
    		progress,
    		$progress
    	});

    	return [progress, $progress];
    }

    class Progress extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { progress: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Progress",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get progress() {
    		return this.$$.ctx[0];
    	}

    	set progress(value) {
    		throw new Error("<Progress>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\DropDown.svelte generated by Svelte v3.38.3 */

    const { Object: Object_1 } = globals;
    const file$1 = "src\\DropDown.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[3] = list[i];
    	return child_ctx;
    }

    // (32:8) {#each Object.keys(PossibleTrainingSets) as trainingSet}
    function create_each_block(ctx) {
    	let button;
    	let t_value = /*PossibleTrainingSets*/ ctx[0][/*trainingSet*/ ctx[3]].name + "";
    	let t;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			t = text(t_value);
    			attr_dev(button, "class", "lx-nav-item-button svelte-q0gal");
    			add_location(button, file$1, 32, 12, 777);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			append_dev(button, t);

    			if (!mounted) {
    				dispose = listen_dev(
    					button,
    					"click",
    					function () {
    						if (is_function(/*onClickDropDownItem*/ ctx[1](/*trainingSet*/ ctx[3]))) /*onClickDropDownItem*/ ctx[1](/*trainingSet*/ ctx[3]).apply(this, arguments);
    					},
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty & /*PossibleTrainingSets*/ 1 && t_value !== (t_value = /*PossibleTrainingSets*/ ctx[0][/*trainingSet*/ ctx[3]].name + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(32:8) {#each Object.keys(PossibleTrainingSets) as trainingSet}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let div1;
    	let span;
    	let t1;
    	let div0;
    	let each_value = Object.keys(/*PossibleTrainingSets*/ ctx[0]);
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			span = element("span");
    			span.textContent = " Training Sets";
    			t1 = space();
    			div0 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(span, "on", "");
    			add_location(span, file$1, 29, 4, 622);
    			attr_dev(div0, "class", "lx-nav-item dropdown svelte-q0gal");
    			add_location(div0, file$1, 30, 4, 663);
    			attr_dev(div1, "class", "lx-nav-item has-dropdown svelte-q0gal");
    			add_location(div1, file$1, 28, 0, 578);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, span);
    			append_dev(div1, t1);
    			append_dev(div1, div0);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div0, null);
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*onClickDropDownItem, Object, PossibleTrainingSets*/ 3) {
    				each_value = Object.keys(/*PossibleTrainingSets*/ ctx[0]);
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div0, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("DropDown", slots, []);
    	const newTrainingSetSelectedEvent = createEventDispatcher();
    	let { PossibleTrainingSets = [] } = $$props;

    	function onClickDropDownItem(item) {
    		newTrainingSetSelectedEvent("selectedNewTrainingSet", item);
    	}

    	const writable_props = ["PossibleTrainingSets"];

    	Object_1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<DropDown> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ("PossibleTrainingSets" in $$props) $$invalidate(0, PossibleTrainingSets = $$props.PossibleTrainingSets);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		newTrainingSetSelectedEvent,
    		PossibleTrainingSets,
    		onClickDropDownItem
    	});

    	$$self.$inject_state = $$props => {
    		if ("PossibleTrainingSets" in $$props) $$invalidate(0, PossibleTrainingSets = $$props.PossibleTrainingSets);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [PossibleTrainingSets, onClickDropDownItem];
    }

    class DropDown extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { PossibleTrainingSets: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "DropDown",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get PossibleTrainingSets() {
    		throw new Error("<DropDown>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set PossibleTrainingSets(value) {
    		throw new Error("<DropDown>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const trainingSets = {"RoysSet":{"name":"Roy's TrainingSet","data":[{"type":"multi/choice","frontPhrase":"Which province does the king of the netherlands live in?","Answers":["Zuid-Holland","Groningen","Utrecht"],"correctPhrase":"Zuid-Holland","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"What trade alliance did the Dutch with 4 other countries start?  ","Answers":["The European Union","The Benelux","NATO"],"correctPhrase":"The European Union","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"What is the firstname of the Dutch Queen","Answers":["Maxima","Beatrix","Wilhemina"],"correctPhrase":"Maxima","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"From what country is the queen of the netherlands orginally?","Answers":["Argentinie ","Nederland","Duitsland"],"correctPhrase":"Argentinie ","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"From what age are you required to wear a id card at all times in the netherlands?","Answers":["14 jaar oud","18 jaar oud","21 jaar oud"],"correctPhrase":"14 jaar oud","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"What do you need to use public transport in the netherlands","Answers":["OV-chipkaart","ID card","passport"],"correctPhrase":"OV-chipkaart","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"What is a drivers license called in dutch?","Answers":["Rijbewijs","vervoersbewijs","koets"],"correctPhrase":"Rijbewijs","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"When is the national Remembrance of the dead day?","Answers":["4 Mei","14 April","5 Mei"],"correctPhrase":"4 Mei","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"When is the dutch independence day","Answers":["5 Mei","14 April","4 Mei"],"correctPhrase":"5 Mei","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"When is the King's birthday (our national holiday)","Answers":["27 April","30 April","11 Juli"],"correctPhrase":"27 April","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"What is the Dutch King's name","Answers":["Koning Willem-Alexander","Koning Willem-Alexander II","Koningin Beatrix"],"correctPhrase":"Koning Willem-Alexander","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"I like cooking","Answers":["Ik kook graag","Ik vindt koken leuk","Graag ik koken"],"correctPhrase":"Ik kook graag","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"In my free time I like to draw","Answers":["In mijn vrije tijd teken ik graag","In mijn tijd teken ik graag","Tijdens mijn vrij teken ik"],"correctPhrase":"In mijn vrije tijd teken ik graag","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"I like to draw as my hobby","Answers":["Ik vind tekenen leuk als mijn hobby","Ik vind tekenen niet leuk als mijn hobby","Ik mag tekenen leuk als mijn hobby"],"correctPhrase":"Ik vind tekenen leuk als mijn hobby","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"Milk and sugar please.","Answers":["Melk en suiker alstublieft","Melk en suiker","Ik hou van jouw"],"correctPhrase":"Melk en suiker alstublieft","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"No, thank you I am full.","Answers":["Nee, dankje wel ik zit vol","Nee, ik zit vol","Dankje wel ik zit vol"],"correctPhrase":"Nee, dankje wel ik zit vol","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"I would like some pancakes🥞","Answers":["Ik will graag pannenkoeken","Ik moet pannenkoeken eten","Ik mag pannenkoeken eten"],"correctPhrase":"Ik will graag pannenkoeken","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"What do you have in your coffee?","Answers":["Wat heeft u in u koffie?","Wat heeft u over uw koffie?","Wat hebben u in uw koffie? "],"correctPhrase":"Wat heeft u in u koffie?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"Thank you","Answers":["Dankjewel","Dank u wel","Fuck off"],"correctPhrase":"Dankjewel","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"My maiden name is ...","Answers":["Mijn moedersnaam is ...","Ben mijn moedersnaam","Mijn achternaam is ..."],"correctPhrase":"Mijn moedersnaam is ...","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"I was born in General Santos city","Answers":["Ik was geboren in general Santos city","Ik ben geboren in general Santos city","Ik was gebracht in general Santos city"],"correctPhrase":"Ik was geboren in general Santos city","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"My birthday is twelve November nineteen ninety-two","Answers":["Mijn geboortedatum is negentien tweennegentig","Mijn geboorteplaats is negentien tweennegentig","Mijn geboorteplaats is negentien negenentwee"],"correctPhrase":"Mijn geboortedatum is negentien tweennegentig","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"U buy your ticket over there.","Answers":["U koopt uw kaartje daar.","U kopen uw kaartje hier.","U kopen uw kaart daar."],"correctPhrase":"U koopt uw kaartje daar.","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"I love pizza","Answers":["Ik hou van pizza","Ik was van pizza","Ik houden van pizza"],"correctPhrase":"Ik hou van pizza","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"My favorite drink is mojito.","Answers":["Mijn favoriete drankje is mojito","Mijn drankje is mojito","Mijn favoriete drankje was mojito"],"correctPhrase":"Mijn favoriete drankje is mojito","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"No, I am not thirsty.","Answers":["Nee, ik heb geen dorst.","Nee, ik was dorstig ","Nee, ik moet geen dorst"],"correctPhrase":"Nee, ik heb geen dorst.","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"Yes, I liked my food","Answers":["Ja ik vond het eten lekker","Ja ik eten lekker","Ja eten  was lekker"],"correctPhrase":"Ja ik vond het eten lekker","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"My address is Wezellaan hundred fifthy six.","Answers":["Mijn adres is Wezellaan honderdzessenvijftig","Mijn adres is Wezellaan honderdvijftigenzes","Mijn adres was Wezellaan honderdvijftigenzes"],"correctPhrase":"Mijn adres is Wezellaan honderdzessenvijftig","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"I live in dubai","Answers":["Ik woon in dubai","Ik was in dubai","Ik weet in dubai"],"correctPhrase":"Ik woon in dubai","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"Did you like your food?","Answers":["Vond je het eten lekker?","Vond jij eten leuk?","Welk eten had jij?"],"correctPhrase":"Vond je het eten lekker?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"What is your adress?","Answers":["Wat is uw adres?","Wat is jouw geboortedatum?","Wat is jouw BSN?"],"correctPhrase":"Wat is uw adres?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"Are you still thirsty?","Answers":["Heeft u nog dorst?","Is er nog dorst?","Hebben u nog dorst?"],"correctPhrase":"Heeft u nog dorst?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"What drink is ur favorite?","Answers":["Welk drinken is uw favorite?","Wat is uw favorite?","Wanneer is uw favorite drankje?"],"correctPhrase":"Welk drinken is uw favorite?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"What do you like to eat?","Answers":["Wat eet u graag?","Wat eet u normaal?","Waarom eet u graag?"],"correctPhrase":"Wat eet u graag?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"There is a five-minute delay of the train.","Answers":["Er is vijf minuten vertraging van de stoptrein.","Er is vijf uren vertraging van de stoptrein.","Er is over vijf minuten een trein."],"correctPhrase":"Er is vijf minuten vertraging van de stoptrein.","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"Where do I buy my ticket?","Answers":["Waar koop ik mijn kaartje?","Wanneer koop ik mijn kaartje?","Wat zijn kaartjes?"],"correctPhrase":"Waar koop ik mijn kaartje?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"What is your birthdate?","Answers":["Wat is je geboortedatum?","Wat is jouw geboorteplaats?","Wat is jouw BSN?"],"correctPhrase":"Wat is je geboortedatum?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"What is your birthplace?","Answers":["Wat is jouw geboorteplaats?","Wat is je geboortedatum?","Wat is jouw BSN?"],"correctPhrase":"Wat is jouw geboorteplaats?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"Would you like more milk in ur tea/coffee?","Answers":["Wilt u meer melk in uw thee/koffie?","Wilt u melk in uw thee/koffie?","Wilt u minder melk in uw thee/koffie?"],"correctPhrase":"Wilt u meer melk in uw thee/koffie?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"What is your maiden name?","Answers":["Wat is je meisjesnaam?","Wat is uw adres?","Wat is jouw geboortedatum?"],"correctPhrase":"Wat is je meisjesnaam?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"What is your BSN?","Answers":["Wat is jouw BSN?","Wat is je geboortedatum?","Wat is jouw geboorteplaats?"],"correctPhrase":"Wat is jouw BSN?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"Please wear your mask.","Answers":["Draag alsjeblieft je mondkapje.","Heeft u een mondkapje?","Draag geen mondkapje alsjeblieft."],"correctPhrase":"Draag alsjeblieft je mondkapje.","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"The next stop is Winschoten.","Answers":["De volgende halte is Winschoten.","De eindbestemming is Winschoten","De vorige halte is Winschoten."],"correctPhrase":"De volgende halte is Winschoten.","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"What platform is the train arriving?","Answers":["Op welk spoor komt de trein aan?","Wanneer komt de trein op spoor 1A?","Waar koop ik mijn kaartje?"],"correctPhrase":"Op welk spoor komt de trein aan?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"Where are u going?","Answers":["Waar gaat uw heen?","Waar bent u geweest?","Wanneer gaat u heen?"],"correctPhrase":"Waar gaat uw heen?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"May I see your ticket?","Answers":["Mag ik uw vervoersbewijs zien?","Mag ik uw identiteitskaart zien?","Waar gaat u heen?"],"correctPhrase":"Mag ik uw vervoersbewijs zien?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"When will the train arrive on track 1A?","Answers":["Wanneer komt de trein op spoor 1A?","Op welk spoor komt de trein aan?","Waar koop ik mijn kaartje?"],"correctPhrase":"Wanneer komt de trein op spoor 1A?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"Are you still hungry?","Answers":["Heb je nog honger?","Is er nog honger?","Hebben u nog honger?"],"correctPhrase":"Heb je nog honger?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"Where would you like to eat?","Answers":["Waar zou je willen eten?","Wat eet u normaal?","Waarom eet u graag?"],"correctPhrase":"Waar zou je willen eten?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"Is this enough soda for you?","Answers":["Is dit genoeg frisdrank voor uw?","Is er genoeg frisdrank voor ons?","Moet er meer frisdrank voor uw?"],"correctPhrase":"Is dit genoeg frisdrank voor uw?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"Did you like your drink?","Answers":["Vond je je drankje lekker?","Wat vindt jij van het drankje?","Waar is jouw drankje?"],"correctPhrase":"Vond je je drankje lekker?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"Have you had enough?","Answers":["Heeft u genoeg gehad?","Wilt u genoeg?","Zijn er genoeg van?"],"correctPhrase":"Heeft u genoeg gehad?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"What drink do u like?","Answers":["Wat voor drankje vind je lekker?","Welke drank is uw favorite?","Waar is uw drankje?"],"correctPhrase":"Wat voor drankje vind je lekker?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"Would u like whipcream in ur Moccachino?","Answers":["Wilt u slagroom in uw Moccachino?","Waar wilt u uw slagroom Moccachino?","Wanneer wilt u uw slagroom Moccachino?"],"correctPhrase":"Wilt u slagroom in uw Moccachino?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"Would you like sugar in ur tea/coffee?","Answers":["Wilt u suiker in uw thee/koffie?","Wanneer wilt u suiker in uw thee/koffie?","Waar wilt u suiker in uw thee/koffie?"],"correctPhrase":"Wilt u suiker in uw thee/koffie?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"Would u like ice in ur soda?","Answers":["Wilt u ijs-blokkjes in uw frisdrank?","Wilt uw zoete thee?","Waar wilt u uw zoete thee?"],"correctPhrase":"Wilt u ijs-blokkjes in uw frisdrank?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"More coffee?","Answers":["Meer koffie?","Minder koffie?","Mogen koffie?"],"correctPhrase":"Meer koffie?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"What food is ur favorite?","Answers":["Welk eten is uw favorite?","Wat is uw favorite?","Wanneer is uw favorite eten?"],"correctPhrase":"Welk eten is uw favorite?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"What do you want to eat?","Answers":["Wat wil je eten?","Wanneer wil je eten?","Waar wil je eten?"],"correctPhrase":"Wat wil je eten?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"What do you want to drink?","Answers":["Wat wil je drinken?","Wanneer wil je drinken?","Waar wil je drinken?"],"correctPhrase":"Wat wil je drinken?","lang":"EN-NL"},{"type":"multi/choice","frontPhrase":"Do you like sweet tea?","Answers":["Hou je van zoete thee?","Wilt uw zoete thee?","Waar wilt u uw zoete thee?"],"correctPhrase":"Hou je van zoete thee?","lang":"EN-NL"}]},"AdAppelSA12016P1":{"name":"Spreekvaardigheid A1 - oefentoets 1 (2016)","data":[{"type":"multi/choice","frontPhrase":"test","Answers":["test","test2","test3"],"correctPhrase":"test","lang":"NL-NL"}]},"AdAppelSA12016P2":{"name":"Spreekvaardigheid A1 - oefentoets 2 (2016)","data":[]},"AdAppelSA12016P3":{"name":"Spreekvaardigheid A1 - oefentoets 3 (2016)","data":[]},"AdAppelSA12021P4":{"name":"Spreekvaardigheid A1 - oefentoets 4 (2021)","data":[]},"AdAppelSA12021P5":{"name":"Spreekvaardigheid A1 - oefentoets 5 (2021)","data":[]},"AdAppelSA12021P6":{"name":"Spreekvaardigheid A1 - oefentoets 6 (2021)","data":[]}};

    /* src\App.svelte generated by Svelte v3.38.3 */
    const file = "src\\App.svelte";

    // (59:2) {#if matches}
    function create_if_block_1(ctx) {
    	let main;
    	let section;
    	let div1;
    	let div0;
    	let dropdown;
    	let t0;
    	let span;
    	let t2;
    	let progress_1;
    	let updating_progress;
    	let t3;
    	let phrasecarousel;
    	let updating_chosenTrainingSet;
    	let current;
    	let mounted;
    	let dispose;

    	dropdown = new DropDown({
    			props: { PossibleTrainingSets: trainingSets },
    			$$inline: true
    		});

    	dropdown.$on("selectedNewTrainingSet", /*selectedNewTrainingSetEvent*/ ctx[4]);

    	function progress_1_progress_binding(value) {
    		/*progress_1_progress_binding*/ ctx[5](value);
    	}

    	let progress_1_props = {};

    	if (/*progress*/ ctx[0] !== void 0) {
    		progress_1_props.progress = /*progress*/ ctx[0];
    	}

    	progress_1 = new Progress({ props: progress_1_props, $$inline: true });
    	binding_callbacks.push(() => bind(progress_1, "progress", progress_1_progress_binding));

    	function phrasecarousel_chosenTrainingSet_binding(value) {
    		/*phrasecarousel_chosenTrainingSet_binding*/ ctx[6](value);
    	}

    	let phrasecarousel_props = { isMobile: false, trainingSets };

    	if (/*chosenTrainingSet*/ ctx[1] !== void 0) {
    		phrasecarousel_props.chosenTrainingSet = /*chosenTrainingSet*/ ctx[1];
    	}

    	phrasecarousel = new PhraseCarousel({
    			props: phrasecarousel_props,
    			$$inline: true
    		});

    	binding_callbacks.push(() => bind(phrasecarousel, "chosenTrainingSet", phrasecarousel_chosenTrainingSet_binding));
    	phrasecarousel.$on("newQuestion", /*newQuestionEvent*/ ctx[3]);

    	const block = {
    		c: function create() {
    			main = element("main");
    			section = element("section");
    			div1 = element("div");
    			div0 = element("div");
    			create_component(dropdown.$$.fragment);
    			t0 = space();
    			span = element("span");
    			span.textContent = "Restart";
    			t2 = space();
    			create_component(progress_1.$$.fragment);
    			t3 = space();
    			create_component(phrasecarousel.$$.fragment);
    			attr_dev(span, "class", "lx-badge svelte-bn94br");
    			add_location(span, file, 64, 6, 1671);
    			attr_dev(div0, "class", "lx-row");
    			add_location(div0, file, 62, 5, 1534);
    			attr_dev(div1, "class", "lx-container-70");
    			add_location(div1, file, 61, 4, 1499);
    			attr_dev(section, "class", "has-dflex-center svelte-bn94br");
    			add_location(section, file, 60, 3, 1460);
    			attr_dev(main, "class", "svelte-bn94br");
    			add_location(main, file, 59, 2, 1450);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, main, anchor);
    			append_dev(main, section);
    			append_dev(section, div1);
    			append_dev(div1, div0);
    			mount_component(dropdown, div0, null);
    			append_dev(div0, t0);
    			append_dev(div0, span);
    			append_dev(div0, t2);
    			mount_component(progress_1, div0, null);
    			append_dev(div0, t3);
    			mount_component(phrasecarousel, div0, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(span, "click", /*restartFlashCards*/ ctx[2], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			const progress_1_changes = {};

    			if (!updating_progress && dirty & /*progress*/ 1) {
    				updating_progress = true;
    				progress_1_changes.progress = /*progress*/ ctx[0];
    				add_flush_callback(() => updating_progress = false);
    			}

    			progress_1.$set(progress_1_changes);
    			const phrasecarousel_changes = {};

    			if (!updating_chosenTrainingSet && dirty & /*chosenTrainingSet*/ 2) {
    				updating_chosenTrainingSet = true;
    				phrasecarousel_changes.chosenTrainingSet = /*chosenTrainingSet*/ ctx[1];
    				add_flush_callback(() => updating_chosenTrainingSet = false);
    			}

    			phrasecarousel.$set(phrasecarousel_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(dropdown.$$.fragment, local);
    			transition_in(progress_1.$$.fragment, local);
    			transition_in(phrasecarousel.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(dropdown.$$.fragment, local);
    			transition_out(progress_1.$$.fragment, local);
    			transition_out(phrasecarousel.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main);
    			destroy_component(dropdown);
    			destroy_component(progress_1);
    			destroy_component(phrasecarousel);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(59:2) {#if matches}",
    		ctx
    	});

    	return block;
    }

    // (58:1) <MediaQuery query="(min-width: 1281px)" let:matches>
    function create_default_slot_1(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*matches*/ ctx[11] && create_if_block_1(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (/*matches*/ ctx[11]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*matches*/ 2048) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block_1(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot_1.name,
    		type: "slot",
    		source: "(58:1) <MediaQuery query=\\\"(min-width: 1281px)\\\" let:matches>",
    		ctx
    	});

    	return block;
    }

    // (76:2) {#if matches}
    function create_if_block(ctx) {
    	let main;
    	let section;
    	let div1;
    	let div0;
    	let dropdown;
    	let t0;
    	let span;
    	let t2;
    	let progress_1;
    	let updating_progress;
    	let t3;
    	let phrasecarousel;
    	let updating_chosenTrainingSet;
    	let current;
    	let mounted;
    	let dispose;

    	dropdown = new DropDown({
    			props: { PossibleTrainingSets: trainingSets },
    			$$inline: true
    		});

    	dropdown.$on("selectedNewTrainingSet", /*selectedNewTrainingSetEvent*/ ctx[4]);

    	function progress_1_progress_binding_1(value) {
    		/*progress_1_progress_binding_1*/ ctx[7](value);
    	}

    	let progress_1_props = {};

    	if (/*progress*/ ctx[0] !== void 0) {
    		progress_1_props.progress = /*progress*/ ctx[0];
    	}

    	progress_1 = new Progress({ props: progress_1_props, $$inline: true });
    	binding_callbacks.push(() => bind(progress_1, "progress", progress_1_progress_binding_1));

    	function phrasecarousel_chosenTrainingSet_binding_1(value) {
    		/*phrasecarousel_chosenTrainingSet_binding_1*/ ctx[8](value);
    	}

    	let phrasecarousel_props = { isMobile: true, trainingSets };

    	if (/*chosenTrainingSet*/ ctx[1] !== void 0) {
    		phrasecarousel_props.chosenTrainingSet = /*chosenTrainingSet*/ ctx[1];
    	}

    	phrasecarousel = new PhraseCarousel({
    			props: phrasecarousel_props,
    			$$inline: true
    		});

    	binding_callbacks.push(() => bind(phrasecarousel, "chosenTrainingSet", phrasecarousel_chosenTrainingSet_binding_1));
    	phrasecarousel.$on("newQuestion", /*newQuestionEvent*/ ctx[3]);

    	const block = {
    		c: function create() {
    			main = element("main");
    			section = element("section");
    			div1 = element("div");
    			div0 = element("div");
    			create_component(dropdown.$$.fragment);
    			t0 = space();
    			span = element("span");
    			span.textContent = "Restart";
    			t2 = space();
    			create_component(progress_1.$$.fragment);
    			t3 = space();
    			create_component(phrasecarousel.$$.fragment);
    			attr_dev(span, "class", "lx-badge bs-sm svelte-bn94br");
    			add_location(span, file, 81, 6, 2274);
    			attr_dev(div0, "class", "lx-row");
    			add_location(div0, file, 79, 5, 2137);
    			attr_dev(div1, "class", "lx-container-100");
    			add_location(div1, file, 78, 4, 2101);
    			attr_dev(section, "class", "has-dflex-center svelte-bn94br");
    			add_location(section, file, 77, 3, 2062);
    			attr_dev(main, "class", "svelte-bn94br");
    			add_location(main, file, 76, 2, 2052);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, main, anchor);
    			append_dev(main, section);
    			append_dev(section, div1);
    			append_dev(div1, div0);
    			mount_component(dropdown, div0, null);
    			append_dev(div0, t0);
    			append_dev(div0, span);
    			append_dev(div0, t2);
    			mount_component(progress_1, div0, null);
    			append_dev(div0, t3);
    			mount_component(phrasecarousel, div0, null);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(span, "click", /*restartFlashCards*/ ctx[2], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			const progress_1_changes = {};

    			if (!updating_progress && dirty & /*progress*/ 1) {
    				updating_progress = true;
    				progress_1_changes.progress = /*progress*/ ctx[0];
    				add_flush_callback(() => updating_progress = false);
    			}

    			progress_1.$set(progress_1_changes);
    			const phrasecarousel_changes = {};

    			if (!updating_chosenTrainingSet && dirty & /*chosenTrainingSet*/ 2) {
    				updating_chosenTrainingSet = true;
    				phrasecarousel_changes.chosenTrainingSet = /*chosenTrainingSet*/ ctx[1];
    				add_flush_callback(() => updating_chosenTrainingSet = false);
    			}

    			phrasecarousel.$set(phrasecarousel_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(dropdown.$$.fragment, local);
    			transition_in(progress_1.$$.fragment, local);
    			transition_in(phrasecarousel.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(dropdown.$$.fragment, local);
    			transition_out(progress_1.$$.fragment, local);
    			transition_out(phrasecarousel.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main);
    			destroy_component(dropdown);
    			destroy_component(progress_1);
    			destroy_component(phrasecarousel);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(76:2) {#if matches}",
    		ctx
    	});

    	return block;
    }

    // (75:1) <MediaQuery query="(max-width: 1280px)" let:matches>
    function create_default_slot(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*matches*/ ctx[11] && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (/*matches*/ ctx[11]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*matches*/ 2048) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot.name,
    		type: "slot",
    		source: "(75:1) <MediaQuery query=\\\"(max-width: 1280px)\\\" let:matches>",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let div;
    	let mediaquery0;
    	let t;
    	let mediaquery1;
    	let current;

    	mediaquery0 = new MediaQuery({
    			props: {
    				query: "(min-width: 1281px)",
    				$$slots: {
    					default: [
    						create_default_slot_1,
    						({ matches }) => ({ 11: matches }),
    						({ matches }) => matches ? 2048 : 0
    					]
    				},
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	mediaquery1 = new MediaQuery({
    			props: {
    				query: "(max-width: 1280px)",
    				$$slots: {
    					default: [
    						create_default_slot,
    						({ matches }) => ({ 11: matches }),
    						({ matches }) => matches ? 2048 : 0
    					]
    				},
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(mediaquery0.$$.fragment);
    			t = space();
    			create_component(mediaquery1.$$.fragment);
    			add_location(div, file, 56, 0, 1372);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(mediaquery0, div, null);
    			append_dev(div, t);
    			mount_component(mediaquery1, div, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const mediaquery0_changes = {};

    			if (dirty & /*$$scope, chosenTrainingSet, progress, matches*/ 6147) {
    				mediaquery0_changes.$$scope = { dirty, ctx };
    			}

    			mediaquery0.$set(mediaquery0_changes);
    			const mediaquery1_changes = {};

    			if (dirty & /*$$scope, chosenTrainingSet, progress, matches*/ 6147) {
    				mediaquery1_changes.$$scope = { dirty, ctx };
    			}

    			mediaquery1.$set(mediaquery1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(mediaquery0.$$.fragment, local);
    			transition_in(mediaquery1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(mediaquery0.$$.fragment, local);
    			transition_out(mediaquery1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(mediaquery0);
    			destroy_component(mediaquery1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("App", slots, []);
    	let totalAmountOfQuestions = 0;
    	let currentAmountOfCorrectQuestions = 0;
    	let progress;
    	let chosenTrainingSet = "none";

    	function restartFlashCards() {
    		$$invalidate(1, chosenTrainingSet = "none");
    	}

    	function newQuestionEvent(eventData) {
    		if (totalAmountOfQuestions === 0) totalAmountOfQuestions = trainingSets[chosenTrainingSet].data.length;

    		if (eventData.detail.detail.isCorrect) {
    			currentAmountOfCorrectQuestions++;
    			progress.set(currentAmountOfCorrectQuestions / totalAmountOfQuestions);
    		}
    	}

    	function selectedNewTrainingSetEvent(eventData) {
    		$$invalidate(1, chosenTrainingSet = "loading");

    		setTimeout(
    			function () {
    				progress.set(0);
    				$$invalidate(1, chosenTrainingSet = eventData.detail);
    				currentAmountOfCorrectQuestions = 0;
    				totalAmountOfQuestions = trainingSets[chosenTrainingSet].data.length;
    			},
    			1500
    		);
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	function progress_1_progress_binding(value) {
    		progress = value;
    		$$invalidate(0, progress);
    	}

    	function phrasecarousel_chosenTrainingSet_binding(value) {
    		chosenTrainingSet = value;
    		$$invalidate(1, chosenTrainingSet);
    	}

    	function progress_1_progress_binding_1(value) {
    		progress = value;
    		$$invalidate(0, progress);
    	}

    	function phrasecarousel_chosenTrainingSet_binding_1(value) {
    		chosenTrainingSet = value;
    		$$invalidate(1, chosenTrainingSet);
    	}

    	$$self.$capture_state = () => ({
    		PhraseCarousel,
    		MediaQuery,
    		Progress,
    		DropDown,
    		trainingSets,
    		totalAmountOfQuestions,
    		currentAmountOfCorrectQuestions,
    		progress,
    		chosenTrainingSet,
    		restartFlashCards,
    		newQuestionEvent,
    		selectedNewTrainingSetEvent
    	});

    	$$self.$inject_state = $$props => {
    		if ("totalAmountOfQuestions" in $$props) totalAmountOfQuestions = $$props.totalAmountOfQuestions;
    		if ("currentAmountOfCorrectQuestions" in $$props) currentAmountOfCorrectQuestions = $$props.currentAmountOfCorrectQuestions;
    		if ("progress" in $$props) $$invalidate(0, progress = $$props.progress);
    		if ("chosenTrainingSet" in $$props) $$invalidate(1, chosenTrainingSet = $$props.chosenTrainingSet);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		progress,
    		chosenTrainingSet,
    		restartFlashCards,
    		newQuestionEvent,
    		selectedNewTrainingSetEvent,
    		progress_1_progress_binding,
    		phrasecarousel_chosenTrainingSet_binding,
    		progress_1_progress_binding_1,
    		phrasecarousel_chosenTrainingSet_binding_1
    	];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App({
    	target: document.body,
    	props: {
    	}
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
