"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/concat-map/index.js
var require_concat_map = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/concat-map/index.js"(exports2, module2) {
    module2.exports = function(xs, fn) {
      var res = [];
      for (var i = 0; i < xs.length; i++) {
        var x = fn(xs[i], i);
        if (isArray(x)) res.push.apply(res, x);
        else res.push(x);
      }
      return res;
    };
    var isArray = Array.isArray || function(xs) {
      return Object.prototype.toString.call(xs) === "[object Array]";
    };
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/balanced-match/index.js
var require_balanced_match = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/balanced-match/index.js"(exports2, module2) {
    "use strict";
    module2.exports = balanced;
    function balanced(a, b, str) {
      if (a instanceof RegExp) a = maybeMatch(a, str);
      if (b instanceof RegExp) b = maybeMatch(b, str);
      var r = range(a, b, str);
      return r && {
        start: r[0],
        end: r[1],
        pre: str.slice(0, r[0]),
        body: str.slice(r[0] + a.length, r[1]),
        post: str.slice(r[1] + b.length)
      };
    }
    function maybeMatch(reg, str) {
      var m = str.match(reg);
      return m ? m[0] : null;
    }
    balanced.range = range;
    function range(a, b, str) {
      var begs, beg, left, right, result;
      var ai = str.indexOf(a);
      var bi = str.indexOf(b, ai + 1);
      var i = ai;
      if (ai >= 0 && bi > 0) {
        if (a === b) {
          return [ai, bi];
        }
        begs = [];
        left = str.length;
        while (i >= 0 && !result) {
          if (i == ai) {
            begs.push(i);
            ai = str.indexOf(a, i + 1);
          } else if (begs.length == 1) {
            result = [begs.pop(), bi];
          } else {
            beg = begs.pop();
            if (beg < left) {
              left = beg;
              right = bi;
            }
            bi = str.indexOf(b, i + 1);
          }
          i = ai < bi && ai >= 0 ? ai : bi;
        }
        if (begs.length) {
          result = [left, right];
        }
      }
      return result;
    }
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/brace-expansion/index.js
var require_brace_expansion = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/brace-expansion/index.js"(exports2, module2) {
    var concatMap = require_concat_map();
    var balanced = require_balanced_match();
    module2.exports = expandTop;
    var escSlash = "\0SLASH" + Math.random() + "\0";
    var escOpen = "\0OPEN" + Math.random() + "\0";
    var escClose = "\0CLOSE" + Math.random() + "\0";
    var escComma = "\0COMMA" + Math.random() + "\0";
    var escPeriod = "\0PERIOD" + Math.random() + "\0";
    var EXPANSION_MAX = 1e5;
    var EXPANSION_MAX_LENGTH = 4e6;
    var EXPANSION_MAX_DEPTH = 1e3;
    var EXPANSION_MAX_REWRITES = 1e3;
    function numeric(str) {
      return parseInt(str, 10) == str ? parseInt(str, 10) : str.charCodeAt(0);
    }
    function escapeBraces(str) {
      return str.split("\\\\").join(escSlash).split("\\{").join(escOpen).split("\\}").join(escClose).split("\\,").join(escComma).split("\\.").join(escPeriod);
    }
    function unescapeBraces(str) {
      return str.split(escSlash).join("\\").split(escOpen).join("{").split(escClose).join("}").split(escComma).join(",").split(escPeriod).join(".");
    }
    function pushAll(target, items) {
      for (var i = 0; i < items.length; i++) {
        target.push(items[i]);
      }
    }
    function parseCommaParts(str) {
      var parts = [];
      var carry = "";
      for (; ; ) {
        var m = balanced("{", "}", str);
        if (!m) {
          var tail = str.split(",");
          tail[0] = carry + tail[0];
          pushAll(parts, tail);
          return parts;
        }
        var pre = m.pre;
        var body = m.body;
        var post = m.post;
        var p = pre.split(",");
        p[0] = carry + p[0];
        p[p.length - 1] += "{" + body + "}";
        if (!post.length) {
          pushAll(parts, p);
          return parts;
        }
        carry = p.pop();
        pushAll(parts, p);
        str = post;
      }
    }
    function expandTop(str, options) {
      if (!str)
        return [];
      options = options || {};
      var max = options.max == null ? EXPANSION_MAX : options.max;
      var maxLength = options.maxLength == null ? EXPANSION_MAX_LENGTH : options.maxLength;
      var maxDepth = options.maxDepth == null ? EXPANSION_MAX_DEPTH : options.maxDepth;
      var maxRewrites = options.maxRewrites == null ? EXPANSION_MAX_REWRITES : options.maxRewrites;
      if (str.substr(0, 2) === "{}") {
        str = "\\{\\}" + str.substr(2);
      }
      return expand(escapeBraces(str), max, maxLength, maxDepth, 0, maxRewrites, true).map(unescapeBraces);
    }
    function embrace(str) {
      return "{" + str + "}";
    }
    function isPadded(el) {
      return /^-?0\d/.test(el);
    }
    function lte(i, y) {
      return i <= y;
    }
    function gte(i, y) {
      return i >= y;
    }
    function combine(acc, base, pre, values, max, maxLength, dropEmpties, outBase) {
      var out = [];
      var length = 0;
      for (var a = 0; a < acc.length; a++) {
        for (var v = 0; v < values.length; v++) {
          if (out.length >= max) return out;
          var expansion = acc[a] + pre + values[v];
          if (dropEmpties && expansion.length === base[a]) continue;
          if (length + expansion.length > maxLength) return out;
          out.push(expansion);
          outBase.push(base[a]);
          length += expansion.length;
        }
      }
      return out;
    }
    function expandSequence(body, isAlphaSequence, max, maxLength) {
      var n = body.split(/\.\./);
      var N = [];
      if (n[0] === void 0 || n[1] === void 0) {
        return N;
      }
      var x = numeric(n[0]);
      var y = numeric(n[1]);
      var width = Math.max(n[0].length, n[1].length);
      var incr = n.length === 3 && n[2] !== void 0 ? Math.max(Math.abs(numeric(n[2])), 1) : 1;
      var test = lte;
      var reverse = y < x;
      if (reverse) {
        incr *= -1;
        test = gte;
      }
      var pad = n.some(isPadded);
      var length = 0;
      for (var i = x; test(i, y) && N.length < max; i += incr) {
        var c;
        if (isAlphaSequence) {
          c = String.fromCharCode(i);
          if (c === "\\") {
            c = "";
          }
        } else {
          c = String(i);
          if (pad) {
            var need = width - c.length;
            if (need > 0) {
              var z = new Array(need + 1).join("0");
              if (i < 0) {
                c = "-" + z + c.slice(1);
              } else {
                c = z + c;
              }
            }
          }
        }
        if (length + c.length > maxLength) break;
        N.push(c);
        length += c.length;
      }
      return N;
    }
    function expand(str, max, maxLength, maxDepth, depth, maxRewrites, isTop) {
      if (depth > maxDepth) {
        return [str];
      }
      var acc = [""];
      var accBase = [0];
      var rewrites = 0;
      var dropEmpties = false;
      var firstGroup = true;
      var nextBase;
      for (; ; ) {
        var m = balanced("{", "}", str);
        if (!m) {
          return combine(acc, accBase, str, [""], max, maxLength, dropEmpties, []);
        }
        var pre = m.pre;
        if (/\$$/.test(pre)) {
          return combine(acc, accBase, str, [""], max, maxLength, dropEmpties, []);
        }
        var isNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(m.body);
        var isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(m.body);
        var isSequence = isNumericSequence || isAlphaSequence;
        var isOptions = m.body.indexOf(",") >= 0;
        if (!isSequence && !isOptions) {
          if (rewrites < maxRewrites && m.post.match(/,(?!,).*\}/)) {
            rewrites++;
            str = m.pre + "{" + m.body + escClose + m.post;
            isTop = true;
            firstGroup = true;
            dropEmpties = false;
            accBase = [];
            for (var b = 0; b < acc.length; b++) {
              accBase.push(acc[b].length);
            }
            continue;
          }
          return combine(
            acc,
            accBase,
            pre + "{" + m.body + "}" + m.post,
            [""],
            max,
            maxLength,
            dropEmpties,
            []
          );
        }
        if (firstGroup) {
          dropEmpties = isTop && !isSequence;
          firstGroup = false;
        }
        var values;
        if (isSequence) {
          values = expandSequence(m.body, isAlphaSequence, max, maxLength);
        } else {
          var n = parseCommaParts(m.body);
          if (n.length === 1 && n[0] !== void 0) {
            n = expand(n[0], max, maxLength, maxDepth, depth + 1, maxRewrites, false).map(embrace);
            if (n.length === 1) {
              nextBase = [];
              acc = combine(
                acc,
                accBase,
                pre + n[0],
                [""],
                max,
                maxLength,
                dropEmpties && !m.post.length,
                nextBase
              );
              accBase = nextBase;
              if (!m.post.length) break;
              str = m.post;
              continue;
            }
          }
          var dropsEmpties = dropEmpties && !m.post.length && !pre;
          for (var d = 0; dropsEmpties && d < acc.length; d++) {
            if (acc[d].length !== accBase[d]) {
              dropsEmpties = false;
            }
          }
          values = [];
          var valuesLength = 0;
          outer: for (var j = 0; j < n.length; j++) {
            var expanded = expand(n[j], max, maxLength, maxDepth, depth + 1, maxRewrites, false);
            for (var k = 0; k < expanded.length; k++) {
              var v = expanded[k];
              if (dropsEmpties && !v) continue;
              if (values.length >= max || valuesLength + v.length > maxLength) {
                break outer;
              }
              values.push(v);
              valuesLength += v.length;
            }
          }
        }
        nextBase = [];
        acc = combine(
          acc,
          accBase,
          pre,
          values,
          max,
          maxLength,
          dropEmpties && !m.post.length,
          nextBase
        );
        accBase = nextBase;
        if (!m.post.length) break;
        str = m.post;
      }
      return acc;
    }
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/minimatch/minimatch.js
var require_minimatch = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/minimatch/minimatch.js"(exports2, module2) {
    module2.exports = minimatch;
    minimatch.Minimatch = Minimatch;
    var path2 = (function() {
      try {
        return require("path");
      } catch (e) {
      }
    })() || {
      sep: "/"
    };
    minimatch.sep = path2.sep;
    var GLOBSTAR = minimatch.GLOBSTAR = Minimatch.GLOBSTAR = {};
    var expand = require_brace_expansion();
    var plTypes = {
      "!": { open: "(?:(?!(?:", close: "))[^/]*?)" },
      "?": { open: "(?:", close: ")?" },
      "+": { open: "(?:", close: ")+" },
      "*": { open: "(?:", close: ")*" },
      "@": { open: "(?:", close: ")" }
    };
    var qmark = "[^/]";
    var star = qmark + "*?";
    var twoStarDot = "(?:(?!(?:\\/|^)(?:\\.{1,2})($|\\/)).)*?";
    var twoStarNoDot = "(?:(?!(?:\\/|^)\\.).)*?";
    var reSpecials = charSet("().*{}+?[]^$\\!");
    function charSet(s) {
      return s.split("").reduce(function(set, c) {
        set[c] = true;
        return set;
      }, {});
    }
    var slashSplit = /\/+/;
    minimatch.filter = filter;
    function filter(pattern, options) {
      options = options || {};
      return function(p, i, list) {
        return minimatch(p, pattern, options);
      };
    }
    function ext(a, b) {
      b = b || {};
      var t = {};
      Object.keys(a).forEach(function(k) {
        t[k] = a[k];
      });
      Object.keys(b).forEach(function(k) {
        t[k] = b[k];
      });
      return t;
    }
    minimatch.defaults = function(def) {
      if (!def || typeof def !== "object" || !Object.keys(def).length) {
        return minimatch;
      }
      var orig = minimatch;
      var m = function minimatch2(p, pattern, options) {
        return orig(p, pattern, ext(def, options));
      };
      m.Minimatch = function Minimatch2(pattern, options) {
        return new orig.Minimatch(pattern, ext(def, options));
      };
      m.Minimatch.defaults = function defaults(options) {
        return orig.defaults(ext(def, options)).Minimatch;
      };
      m.filter = function filter2(pattern, options) {
        return orig.filter(pattern, ext(def, options));
      };
      m.defaults = function defaults(options) {
        return orig.defaults(ext(def, options));
      };
      m.makeRe = function makeRe2(pattern, options) {
        return orig.makeRe(pattern, ext(def, options));
      };
      m.braceExpand = function braceExpand2(pattern, options) {
        return orig.braceExpand(pattern, ext(def, options));
      };
      m.match = function(list, pattern, options) {
        return orig.match(list, pattern, ext(def, options));
      };
      return m;
    };
    Minimatch.defaults = function(def) {
      return minimatch.defaults(def).Minimatch;
    };
    function minimatch(p, pattern, options) {
      assertValidPattern(pattern);
      if (!options) options = {};
      if (!options.nocomment && pattern.charAt(0) === "#") {
        return false;
      }
      return new Minimatch(pattern, options).match(p);
    }
    function Minimatch(pattern, options) {
      if (!(this instanceof Minimatch)) {
        return new Minimatch(pattern, options);
      }
      assertValidPattern(pattern);
      if (!options) options = {};
      pattern = pattern.trim();
      if (!options.allowWindowsEscape && path2.sep !== "/") {
        pattern = pattern.split(path2.sep).join("/");
      }
      this.options = options;
      this.maxGlobstarRecursion = options.maxGlobstarRecursion !== void 0 ? options.maxGlobstarRecursion : 200;
      this.set = [];
      this.pattern = pattern;
      this.regexp = null;
      this.negate = false;
      this.comment = false;
      this.empty = false;
      this.partial = !!options.partial;
      this.make();
    }
    Minimatch.prototype.debug = function() {
    };
    Minimatch.prototype.make = make;
    function make() {
      var pattern = this.pattern;
      var options = this.options;
      if (!options.nocomment && pattern.charAt(0) === "#") {
        this.comment = true;
        return;
      }
      if (!pattern) {
        this.empty = true;
        return;
      }
      this.parseNegate();
      var set = this.globSet = this.braceExpand();
      if (options.debug) this.debug = function debug() {
        console.error.apply(console, arguments);
      };
      this.debug(this.pattern, set);
      set = this.globParts = set.map(function(s) {
        return s.split(slashSplit);
      });
      this.debug(this.pattern, set);
      set = set.map(function(s, si, set2) {
        return s.map(this.parse, this);
      }, this);
      this.debug(this.pattern, set);
      set = set.filter(function(s) {
        return s.indexOf(false) === -1;
      });
      this.debug(this.pattern, set);
      this.set = set;
    }
    Minimatch.prototype.parseNegate = parseNegate;
    function parseNegate() {
      var pattern = this.pattern;
      var negate = false;
      var options = this.options;
      var negateOffset = 0;
      if (options.nonegate) return;
      for (var i = 0, l = pattern.length; i < l && pattern.charAt(i) === "!"; i++) {
        negate = !negate;
        negateOffset++;
      }
      if (negateOffset) this.pattern = pattern.substr(negateOffset);
      this.negate = negate;
    }
    minimatch.braceExpand = function(pattern, options) {
      return braceExpand(pattern, options);
    };
    Minimatch.prototype.braceExpand = braceExpand;
    function braceExpand(pattern, options) {
      if (!options) {
        if (this instanceof Minimatch) {
          options = this.options;
        } else {
          options = {};
        }
      }
      pattern = typeof pattern === "undefined" ? this.pattern : pattern;
      assertValidPattern(pattern);
      if (options.nobrace || !/\{(?:(?!\{).)*\}/.test(pattern)) {
        return [pattern];
      }
      return expand(pattern);
    }
    var MAX_PATTERN_LENGTH = 1024 * 64;
    var assertValidPattern = function(pattern) {
      if (typeof pattern !== "string") {
        throw new TypeError("invalid pattern");
      }
      if (pattern.length > MAX_PATTERN_LENGTH) {
        throw new TypeError("pattern is too long");
      }
    };
    Minimatch.prototype.parse = parse;
    var SUBPARSE = {};
    function parse(pattern, isSub) {
      assertValidPattern(pattern);
      var options = this.options;
      if (pattern === "**") {
        if (!options.noglobstar)
          return GLOBSTAR;
        else
          pattern = "*";
      }
      if (pattern === "") return "";
      var re = "";
      var hasMagic = !!options.nocase;
      var escaping = false;
      var patternListStack = [];
      var negativeLists = [];
      var stateChar;
      var inClass = false;
      var reClassStart = -1;
      var classStart = -1;
      var patternStart = pattern.charAt(0) === "." ? "" : options.dot ? "(?!(?:^|\\/)\\.{1,2}(?:$|\\/))" : "(?!\\.)";
      var self = this;
      function clearStateChar() {
        if (stateChar) {
          switch (stateChar) {
            case "*":
              re += star;
              hasMagic = true;
              break;
            case "?":
              re += qmark;
              hasMagic = true;
              break;
            default:
              re += "\\" + stateChar;
              break;
          }
          self.debug("clearStateChar %j %j", stateChar, re);
          stateChar = false;
        }
      }
      for (var i = 0, len = pattern.length, c; i < len && (c = pattern.charAt(i)); i++) {
        this.debug("%s	%s %s %j", pattern, i, re, c);
        if (escaping && reSpecials[c]) {
          re += "\\" + c;
          escaping = false;
          continue;
        }
        switch (c) {
          /* istanbul ignore next */
          case "/": {
            return false;
          }
          case "\\":
            clearStateChar();
            escaping = true;
            continue;
          // the various stateChar values
          // for the "extglob" stuff.
          case "?":
          case "*":
          case "+":
          case "@":
          case "!":
            this.debug("%s	%s %s %j <-- stateChar", pattern, i, re, c);
            if (inClass) {
              this.debug("  in class");
              if (c === "!" && i === classStart + 1) c = "^";
              re += c;
              continue;
            }
            if (c === "*" && stateChar === "*") continue;
            self.debug("call clearStateChar %j", stateChar);
            clearStateChar();
            stateChar = c;
            if (options.noext) clearStateChar();
            continue;
          case "(":
            if (inClass) {
              re += "(";
              continue;
            }
            if (!stateChar) {
              re += "\\(";
              continue;
            }
            patternListStack.push({
              type: stateChar,
              start: i - 1,
              reStart: re.length,
              open: plTypes[stateChar].open,
              close: plTypes[stateChar].close
            });
            re += stateChar === "!" ? "(?:(?!(?:" : "(?:";
            this.debug("plType %j %j", stateChar, re);
            stateChar = false;
            continue;
          case ")":
            if (inClass || !patternListStack.length) {
              re += "\\)";
              continue;
            }
            clearStateChar();
            hasMagic = true;
            var pl = patternListStack.pop();
            re += pl.close;
            if (pl.type === "!") {
              negativeLists.push(pl);
            }
            pl.reEnd = re.length;
            continue;
          case "|":
            if (inClass || !patternListStack.length || escaping) {
              re += "\\|";
              escaping = false;
              continue;
            }
            clearStateChar();
            re += "|";
            continue;
          // these are mostly the same in regexp and glob
          case "[":
            clearStateChar();
            if (inClass) {
              re += "\\" + c;
              continue;
            }
            inClass = true;
            classStart = i;
            reClassStart = re.length;
            re += c;
            continue;
          case "]":
            if (i === classStart + 1 || !inClass) {
              re += "\\" + c;
              escaping = false;
              continue;
            }
            var cs = pattern.substring(classStart + 1, i);
            try {
              RegExp("[" + cs + "]");
            } catch (er) {
              var sp = this.parse(cs, SUBPARSE);
              re = re.substr(0, reClassStart) + "\\[" + sp[0] + "\\]";
              hasMagic = hasMagic || sp[1];
              inClass = false;
              continue;
            }
            hasMagic = true;
            inClass = false;
            re += c;
            continue;
          default:
            clearStateChar();
            if (escaping) {
              escaping = false;
            } else if (reSpecials[c] && !(c === "^" && inClass)) {
              re += "\\";
            }
            re += c;
        }
      }
      if (inClass) {
        cs = pattern.substr(classStart + 1);
        sp = this.parse(cs, SUBPARSE);
        re = re.substr(0, reClassStart) + "\\[" + sp[0];
        hasMagic = hasMagic || sp[1];
      }
      for (pl = patternListStack.pop(); pl; pl = patternListStack.pop()) {
        var tail = re.slice(pl.reStart + pl.open.length);
        this.debug("setting tail", re, pl);
        tail = tail.replace(/((?:\\{2}){0,64})(\\?)\|/g, function(_, $1, $2) {
          if (!$2) {
            $2 = "\\";
          }
          return $1 + $1 + $2 + "|";
        });
        this.debug("tail=%j\n   %s", tail, tail, pl, re);
        var t = pl.type === "*" ? star : pl.type === "?" ? qmark : "\\" + pl.type;
        hasMagic = true;
        re = re.slice(0, pl.reStart) + t + "\\(" + tail;
      }
      clearStateChar();
      if (escaping) {
        re += "\\\\";
      }
      var addPatternStart = false;
      switch (re.charAt(0)) {
        case "[":
        case ".":
        case "(":
          addPatternStart = true;
      }
      for (var n = negativeLists.length - 1; n > -1; n--) {
        var nl = negativeLists[n];
        var nlBefore = re.slice(0, nl.reStart);
        var nlFirst = re.slice(nl.reStart, nl.reEnd - 8);
        var nlLast = re.slice(nl.reEnd - 8, nl.reEnd);
        var nlAfter = re.slice(nl.reEnd);
        nlLast += nlAfter;
        var openParensBefore = nlBefore.split("(").length - 1;
        var cleanAfter = nlAfter;
        for (i = 0; i < openParensBefore; i++) {
          cleanAfter = cleanAfter.replace(/\)[+*?]?/, "");
        }
        nlAfter = cleanAfter;
        var dollar = "";
        if (nlAfter === "" && isSub !== SUBPARSE) {
          dollar = "$";
        }
        var newRe = nlBefore + nlFirst + nlAfter + dollar + nlLast;
        re = newRe;
      }
      if (re !== "" && hasMagic) {
        re = "(?=.)" + re;
      }
      if (addPatternStart) {
        re = patternStart + re;
      }
      if (isSub === SUBPARSE) {
        return [re, hasMagic];
      }
      if (!hasMagic) {
        return globUnescape(pattern);
      }
      var flags = options.nocase ? "i" : "";
      try {
        var regExp = new RegExp("^" + re + "$", flags);
      } catch (er) {
        return new RegExp("$.");
      }
      regExp._glob = pattern;
      regExp._src = re;
      return regExp;
    }
    minimatch.makeRe = function(pattern, options) {
      return new Minimatch(pattern, options || {}).makeRe();
    };
    Minimatch.prototype.makeRe = makeRe;
    function makeRe() {
      if (this.regexp || this.regexp === false) return this.regexp;
      var set = this.set;
      if (!set.length) {
        this.regexp = false;
        return this.regexp;
      }
      var options = this.options;
      var twoStar = options.noglobstar ? star : options.dot ? twoStarDot : twoStarNoDot;
      var flags = options.nocase ? "i" : "";
      var re = set.map(function(pattern) {
        return pattern.map(function(p) {
          return p === GLOBSTAR ? twoStar : typeof p === "string" ? regExpEscape(p) : p._src;
        }).join("\\/");
      }).join("|");
      re = "^(?:" + re + ")$";
      if (this.negate) re = "^(?!" + re + ").*$";
      try {
        this.regexp = new RegExp(re, flags);
      } catch (ex) {
        this.regexp = false;
      }
      return this.regexp;
    }
    minimatch.match = function(list, pattern, options) {
      options = options || {};
      var mm = new Minimatch(pattern, options);
      list = list.filter(function(f) {
        return mm.match(f);
      });
      if (mm.options.nonull && !list.length) {
        list.push(pattern);
      }
      return list;
    };
    Minimatch.prototype.match = function match(f, partial) {
      if (typeof partial === "undefined") partial = this.partial;
      this.debug("match", f, this.pattern);
      if (this.comment) return false;
      if (this.empty) return f === "";
      if (f === "/" && partial) return true;
      var options = this.options;
      if (path2.sep !== "/") {
        f = f.split(path2.sep).join("/");
      }
      f = f.split(slashSplit);
      this.debug(this.pattern, "split", f);
      var set = this.set;
      this.debug(this.pattern, "set", set);
      var filename;
      var i;
      for (i = f.length - 1; i >= 0; i--) {
        filename = f[i];
        if (filename) break;
      }
      for (i = 0; i < set.length; i++) {
        var pattern = set[i];
        var file = f;
        if (options.matchBase && pattern.length === 1) {
          file = [filename];
        }
        var hit = this.matchOne(file, pattern, partial);
        if (hit) {
          if (options.flipNegate) return true;
          return !this.negate;
        }
      }
      if (options.flipNegate) return false;
      return this.negate;
    };
    Minimatch.prototype.matchOne = function(file, pattern, partial) {
      if (pattern.indexOf(GLOBSTAR) !== -1) {
        return this._matchGlobstar(file, pattern, partial, 0, 0);
      }
      return this._matchOne(file, pattern, partial, 0, 0);
    };
    Minimatch.prototype._matchGlobstar = function(file, pattern, partial, fileIndex, patternIndex) {
      var i;
      var firstgs = -1;
      for (i = patternIndex; i < pattern.length; i++) {
        if (pattern[i] === GLOBSTAR) {
          firstgs = i;
          break;
        }
      }
      var lastgs = -1;
      for (i = pattern.length - 1; i >= 0; i--) {
        if (pattern[i] === GLOBSTAR) {
          lastgs = i;
          break;
        }
      }
      var head = pattern.slice(patternIndex, firstgs);
      var body = partial ? pattern.slice(firstgs + 1) : pattern.slice(firstgs + 1, lastgs);
      var tail = partial ? [] : pattern.slice(lastgs + 1);
      if (head.length) {
        var fileHead = file.slice(fileIndex, fileIndex + head.length);
        if (!this._matchOne(fileHead, head, partial, 0, 0)) {
          return false;
        }
        fileIndex += head.length;
      }
      var fileTailMatch = 0;
      if (tail.length) {
        if (tail.length + fileIndex > file.length) return false;
        var tailStart = file.length - tail.length;
        if (this._matchOne(file, tail, partial, tailStart, 0)) {
          fileTailMatch = tail.length;
        } else {
          if (file[file.length - 1] !== "" || fileIndex + tail.length === file.length) {
            return false;
          }
          tailStart--;
          if (!this._matchOne(file, tail, partial, tailStart, 0)) {
            return false;
          }
          fileTailMatch = tail.length + 1;
        }
      }
      if (!body.length) {
        var sawSome = !!fileTailMatch;
        for (i = fileIndex; i < file.length - fileTailMatch; i++) {
          var f = String(file[i]);
          sawSome = true;
          if (f === "." || f === ".." || !this.options.dot && f.charAt(0) === ".") {
            return false;
          }
        }
        return partial || sawSome;
      }
      var bodySegments = [[[], 0]];
      var currentBody = bodySegments[0];
      var nonGsParts = 0;
      var nonGsPartsSums = [0];
      for (var bi = 0; bi < body.length; bi++) {
        var b = body[bi];
        if (b === GLOBSTAR) {
          nonGsPartsSums.push(nonGsParts);
          currentBody = [[], 0];
          bodySegments.push(currentBody);
        } else {
          currentBody[0].push(b);
          nonGsParts++;
        }
      }
      var idx = bodySegments.length - 1;
      var fileLength = file.length - fileTailMatch;
      for (var si = 0; si < bodySegments.length; si++) {
        bodySegments[si][1] = fileLength - (nonGsPartsSums[idx--] + bodySegments[si][0].length);
      }
      return !!this._matchGlobStarBodySections(
        file,
        bodySegments,
        fileIndex,
        0,
        partial,
        0,
        !!fileTailMatch
      );
    };
    Minimatch.prototype._matchGlobStarBodySections = function(file, bodySegments, fileIndex, bodyIndex, partial, globStarDepth, sawTail) {
      var bs = bodySegments[bodyIndex];
      if (!bs) {
        for (var i = fileIndex; i < file.length; i++) {
          sawTail = true;
          var f = file[i];
          if (f === "." || f === ".." || !this.options.dot && f.charAt(0) === ".") {
            return false;
          }
        }
        return sawTail;
      }
      var body = bs[0];
      var after = bs[1];
      while (fileIndex <= after) {
        var m = this._matchOne(
          file.slice(0, fileIndex + body.length),
          body,
          partial,
          fileIndex,
          0
        );
        if (m && globStarDepth < this.maxGlobstarRecursion) {
          var sub = this._matchGlobStarBodySections(
            file,
            bodySegments,
            fileIndex + body.length,
            bodyIndex + 1,
            partial,
            globStarDepth + 1,
            sawTail
          );
          if (sub !== false) {
            return sub;
          }
        }
        var f = file[fileIndex];
        if (f === "." || f === ".." || !this.options.dot && f.charAt(0) === ".") {
          return false;
        }
        fileIndex++;
      }
      return partial || null;
    };
    Minimatch.prototype._matchOne = function(file, pattern, partial, fileIndex, patternIndex) {
      var fi, pi, fl, pl;
      for (fi = fileIndex, pi = patternIndex, fl = file.length, pl = pattern.length; fi < fl && pi < pl; fi++, pi++) {
        this.debug("matchOne loop");
        var p = pattern[pi];
        var f = file[fi];
        this.debug(pattern, p, f);
        if (p === false || p === GLOBSTAR) return false;
        var hit;
        if (typeof p === "string") {
          hit = f === p;
          this.debug("string match", p, f, hit);
        } else {
          hit = f.match(p);
          this.debug("pattern match", p, f, hit);
        }
        if (!hit) return false;
      }
      if (fi === fl && pi === pl) {
        return true;
      } else if (fi === fl) {
        return partial;
      } else if (pi === pl) {
        return fi === fl - 1 && file[fi] === "";
      }
      throw new Error("wtf?");
    };
    function globUnescape(s) {
      return s.replace(/\\(.)/g, "$1");
    }
    function regExpEscape(s) {
      return s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    }
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/@electron/asar/lib/wrapped-fs.js
var require_wrapped_fs = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/@electron/asar/lib/wrapped-fs.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var fs2 = "electron" in process.versions ? require("original-fs") : require("fs");
    var promisifiedMethods = [
      "lstat",
      "mkdtemp",
      "readFile",
      "stat",
      "writeFile",
      "symlink",
      "readlink"
    ];
    var promisified = {};
    for (const method of Object.keys(fs2)) {
      if (promisifiedMethods.includes(method)) {
        promisified[method] = fs2.promises[method];
      } else {
        promisified[method] = fs2[method];
      }
    }
    promisified.mkdirp = (dir) => fs2.promises.mkdir(dir, { recursive: true });
    promisified.mkdirpSync = (dir) => fs2.mkdirSync(dir, { recursive: true });
    exports2.default = promisified;
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/@electron/asar/lib/integrity.js
var require_integrity = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/@electron/asar/lib/integrity.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.getFileIntegrity = getFileIntegrity;
    var crypto2 = __importStar(require("crypto"));
    var stream = __importStar(require("stream"));
    var util_1 = require("util");
    var ALGORITHM = "SHA256";
    var BLOCK_SIZE = 4 * 1024 * 1024;
    var pipeline = (0, util_1.promisify)(stream.pipeline);
    function hashBlock(block) {
      return crypto2.createHash(ALGORITHM).update(block).digest("hex");
    }
    async function getFileIntegrity(inputFileStream) {
      const fileHash = crypto2.createHash(ALGORITHM);
      const blockHashes = [];
      let currentBlockSize = 0;
      let currentBlock = [];
      await pipeline(inputFileStream, new stream.PassThrough({
        decodeStrings: false,
        transform(_chunk, encoding, callback) {
          fileHash.update(_chunk);
          function handleChunk(chunk) {
            const diffToSlice = Math.min(BLOCK_SIZE - currentBlockSize, chunk.byteLength);
            currentBlockSize += diffToSlice;
            currentBlock.push(chunk.slice(0, diffToSlice));
            if (currentBlockSize === BLOCK_SIZE) {
              blockHashes.push(hashBlock(Buffer.concat(currentBlock)));
              currentBlock = [];
              currentBlockSize = 0;
            }
            if (diffToSlice < chunk.byteLength) {
              handleChunk(chunk.slice(diffToSlice));
            }
          }
          handleChunk(_chunk);
          callback();
        },
        flush(callback) {
          blockHashes.push(hashBlock(Buffer.concat(currentBlock)));
          currentBlock = [];
          callback();
        }
      }));
      return {
        algorithm: ALGORITHM,
        hash: fileHash.digest("hex"),
        blockSize: BLOCK_SIZE,
        blocks: blockHashes
      };
    }
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/@electron/asar/lib/filesystem.js
var require_filesystem = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/@electron/asar/lib/filesystem.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Filesystem = void 0;
    var os2 = __importStar(require("os"));
    var path2 = __importStar(require("path"));
    var util_1 = require("util");
    var stream = __importStar(require("stream"));
    var integrity_1 = require_integrity();
    var wrapped_fs_1 = __importDefault(require_wrapped_fs());
    var UINT32_MAX = 2 ** 32 - 1;
    var pipeline = (0, util_1.promisify)(stream.pipeline);
    var Filesystem = class {
      constructor(src) {
        this.src = path2.resolve(src);
        this.header = { files: /* @__PURE__ */ Object.create(null) };
        this.headerSize = 0;
        this.offset = BigInt(0);
      }
      getRootPath() {
        return this.src;
      }
      getHeader() {
        return this.header;
      }
      getHeaderSize() {
        return this.headerSize;
      }
      setHeader(header2, headerSize) {
        this.header = header2;
        this.headerSize = headerSize;
      }
      searchNodeFromDirectory(p) {
        let json = this.header;
        const dirs = p.split(path2.sep);
        for (const dir of dirs) {
          if (dir !== ".") {
            if ("files" in json) {
              if (!json.files[dir]) {
                json.files[dir] = { files: /* @__PURE__ */ Object.create(null) };
              }
              json = json.files[dir];
            } else {
              throw new Error("Unexpected directory state while traversing: " + p);
            }
          }
        }
        return json;
      }
      searchNodeFromPath(p) {
        p = path2.relative(this.src, p);
        if (!p) {
          return this.header;
        }
        const name = path2.basename(p);
        const node = this.searchNodeFromDirectory(path2.dirname(p));
        if (!node.files) {
          node.files = /* @__PURE__ */ Object.create(null);
        }
        if (!node.files[name]) {
          node.files[name] = /* @__PURE__ */ Object.create(null);
        }
        return node.files[name];
      }
      insertDirectory(p, shouldUnpack) {
        const node = this.searchNodeFromPath(p);
        if (shouldUnpack) {
          node.unpacked = shouldUnpack;
        }
        node.files = node.files || /* @__PURE__ */ Object.create(null);
        return node.files;
      }
      async insertFile(p, streamGenerator, shouldUnpack, file, options = {}) {
        const dirNode = this.searchNodeFromPath(path2.dirname(p));
        const node = this.searchNodeFromPath(p);
        if (shouldUnpack || dirNode.unpacked) {
          node.size = file.stat.size;
          node.unpacked = true;
          node.integrity = await (0, integrity_1.getFileIntegrity)(streamGenerator());
          return Promise.resolve();
        }
        let size;
        const transformed = options.transform && options.transform(p);
        if (transformed) {
          const tmpdir = await wrapped_fs_1.default.mkdtemp(path2.join(os2.tmpdir(), "asar-"));
          const tmpfile = path2.join(tmpdir, path2.basename(p));
          const out = wrapped_fs_1.default.createWriteStream(tmpfile);
          await pipeline(streamGenerator(), transformed, out);
          file.transformed = {
            path: tmpfile,
            stat: await wrapped_fs_1.default.lstat(tmpfile)
          };
          size = file.transformed.stat.size;
        } else {
          size = file.stat.size;
        }
        if (size > UINT32_MAX) {
          throw new Error(`${p}: file size can not be larger than 4.2GB`);
        }
        node.size = size;
        node.offset = this.offset.toString();
        node.integrity = await (0, integrity_1.getFileIntegrity)(streamGenerator());
        if (process.platform !== "win32" && file.stat.mode & 64) {
          node.executable = true;
        }
        this.offset += BigInt(size);
      }
      insertLink(p, shouldUnpack, parentPath = wrapped_fs_1.default.realpathSync(path2.dirname(p)), symlink = wrapped_fs_1.default.readlinkSync(p), src = wrapped_fs_1.default.realpathSync(this.src)) {
        const link = this.resolveLink(src, parentPath, symlink);
        if (link.startsWith("..")) {
          throw new Error(`${p}: file "${link}" links out of the package`);
        }
        const node = this.searchNodeFromPath(p);
        const dirNode = this.searchNodeFromPath(path2.dirname(p));
        if (shouldUnpack || dirNode.unpacked) {
          node.unpacked = true;
        }
        node.link = link;
        return link;
      }
      resolveLink(src, parentPath, symlink) {
        const target = path2.join(parentPath, symlink);
        const link = path2.relative(src, target);
        return link;
      }
      listFiles(options) {
        const files = [];
        const fillFilesFromMetadata = function(basePath, metadata) {
          if (!("files" in metadata)) {
            return;
          }
          for (const [childPath, childMetadata] of Object.entries(metadata.files)) {
            const fullPath = path2.join(basePath, childPath);
            const packState = "unpacked" in childMetadata && childMetadata.unpacked ? "unpack" : "pack  ";
            files.push(options && options.isPack ? `${packState} : ${fullPath}` : fullPath);
            fillFilesFromMetadata(fullPath, childMetadata);
          }
        };
        fillFilesFromMetadata("/", this.header);
        return files;
      }
      getNode(p, followLinks = true) {
        const node = this.searchNodeFromDirectory(path2.dirname(p));
        const name = path2.basename(p);
        if ("link" in node && followLinks) {
          return this.getNode(path2.join(node.link, name));
        }
        if (name) {
          return node.files[name];
        } else {
          return node;
        }
      }
      getFile(p, followLinks = true) {
        const info = this.getNode(p, followLinks);
        if (!info) {
          throw new Error(`"${p}" was not found in this archive`);
        }
        if ("link" in info && followLinks) {
          return this.getFile(info.link, followLinks);
        } else {
          return info;
        }
      }
    };
    exports2.Filesystem = Filesystem;
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/@electron/asar/lib/pickle.js
var require_pickle = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/@electron/asar/lib/pickle.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Pickle = void 0;
    var SIZE_INT32 = 4;
    var SIZE_UINT32 = 4;
    var SIZE_INT64 = 8;
    var SIZE_UINT64 = 8;
    var SIZE_FLOAT = 4;
    var SIZE_DOUBLE = 8;
    var PAYLOAD_UNIT = 64;
    var CAPACITY_READ_ONLY = 9007199254740992;
    var alignInt = function(i, alignment) {
      return i + (alignment - i % alignment) % alignment;
    };
    var PickleIterator = class {
      constructor(pickle) {
        this.payload = pickle.getHeader();
        this.payloadOffset = pickle.getHeaderSize();
        this.readIndex = 0;
        this.endIndex = pickle.getPayloadSize();
      }
      readBool() {
        return this.readInt() !== 0;
      }
      readInt() {
        return this.readBytes(SIZE_INT32, Buffer.prototype.readInt32LE);
      }
      readUInt32() {
        return this.readBytes(SIZE_UINT32, Buffer.prototype.readUInt32LE);
      }
      readInt64() {
        return this.readBytes(SIZE_INT64, Buffer.prototype.readBigInt64LE);
      }
      readUInt64() {
        return this.readBytes(SIZE_UINT64, Buffer.prototype.readBigUInt64LE);
      }
      readFloat() {
        return this.readBytes(SIZE_FLOAT, Buffer.prototype.readFloatLE);
      }
      readDouble() {
        return this.readBytes(SIZE_DOUBLE, Buffer.prototype.readDoubleLE);
      }
      readString() {
        return this.readBytes(this.readInt()).toString();
      }
      readBytes(length, method) {
        const readPayloadOffset = this.getReadPayloadOffsetAndAdvance(length);
        if (method != null) {
          return method.call(this.payload, readPayloadOffset, length);
        } else {
          return this.payload.slice(readPayloadOffset, readPayloadOffset + length);
        }
      }
      getReadPayloadOffsetAndAdvance(length) {
        if (length > this.endIndex - this.readIndex) {
          this.readIndex = this.endIndex;
          throw new Error("Failed to read data with length of " + length);
        }
        const readPayloadOffset = this.payloadOffset + this.readIndex;
        this.advance(length);
        return readPayloadOffset;
      }
      advance(size) {
        const alignedSize = alignInt(size, SIZE_UINT32);
        if (this.endIndex - this.readIndex < alignedSize) {
          this.readIndex = this.endIndex;
        } else {
          this.readIndex += alignedSize;
        }
      }
    };
    var Pickle = class _Pickle {
      constructor(buffer) {
        if (buffer) {
          this.header = buffer;
          this.headerSize = buffer.length - this.getPayloadSize();
          this.capacityAfterHeader = CAPACITY_READ_ONLY;
          this.writeOffset = 0;
          if (this.headerSize > buffer.length) {
            this.headerSize = 0;
          }
          if (this.headerSize !== alignInt(this.headerSize, SIZE_UINT32)) {
            this.headerSize = 0;
          }
          if (this.headerSize === 0) {
            this.header = Buffer.alloc(0);
          }
        } else {
          this.header = Buffer.alloc(0);
          this.headerSize = SIZE_UINT32;
          this.capacityAfterHeader = 0;
          this.writeOffset = 0;
          this.resize(PAYLOAD_UNIT);
          this.setPayloadSize(0);
        }
      }
      static createEmpty() {
        return new _Pickle();
      }
      static createFromBuffer(buffer) {
        return new _Pickle(buffer);
      }
      getHeader() {
        return this.header;
      }
      getHeaderSize() {
        return this.headerSize;
      }
      createIterator() {
        return new PickleIterator(this);
      }
      toBuffer() {
        return this.header.slice(0, this.headerSize + this.getPayloadSize());
      }
      writeBool(value) {
        return this.writeInt(value ? 1 : 0);
      }
      writeInt(value) {
        return this.writeBytes(value, SIZE_INT32, Buffer.prototype.writeInt32LE);
      }
      writeUInt32(value) {
        return this.writeBytes(value, SIZE_UINT32, Buffer.prototype.writeUInt32LE);
      }
      writeInt64(value) {
        return this.writeBytes(BigInt(value), SIZE_INT64, Buffer.prototype.writeBigInt64LE);
      }
      writeUInt64(value) {
        return this.writeBytes(BigInt(value), SIZE_UINT64, Buffer.prototype.writeBigUInt64LE);
      }
      writeFloat(value) {
        return this.writeBytes(value, SIZE_FLOAT, Buffer.prototype.writeFloatLE);
      }
      writeDouble(value) {
        return this.writeBytes(value, SIZE_DOUBLE, Buffer.prototype.writeDoubleLE);
      }
      writeString(value) {
        const length = Buffer.byteLength(value, "utf8");
        if (!this.writeInt(length)) {
          return false;
        }
        return this.writeBytes(value, length);
      }
      setPayloadSize(payloadSize) {
        return this.header.writeUInt32LE(payloadSize, 0);
      }
      getPayloadSize() {
        return this.header.readUInt32LE(0);
      }
      writeBytes(data, length, method) {
        const dataLength = alignInt(length, SIZE_UINT32);
        const newSize = this.writeOffset + dataLength;
        if (newSize > this.capacityAfterHeader) {
          this.resize(Math.max(this.capacityAfterHeader * 2, newSize));
        }
        if (method) {
          method.call(this.header, data, this.headerSize + this.writeOffset);
        } else {
          this.header.write(data, this.headerSize + this.writeOffset, length);
        }
        const endOffset = this.headerSize + this.writeOffset + length;
        this.header.fill(0, endOffset, endOffset + dataLength - length);
        this.setPayloadSize(newSize);
        this.writeOffset = newSize;
        return true;
      }
      resize(newCapacity) {
        newCapacity = alignInt(newCapacity, PAYLOAD_UNIT);
        this.header = Buffer.concat([this.header, Buffer.alloc(newCapacity)]);
        this.capacityAfterHeader = newCapacity;
      }
    };
    exports2.Pickle = Pickle;
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/@electron/asar/lib/disk.js
var require_disk = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/@electron/asar/lib/disk.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    var __asyncValues = exports2 && exports2.__asyncValues || function(o) {
      if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
      var m = o[Symbol.asyncIterator], i;
      return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function() {
        return this;
      }, i);
      function verb(n) {
        i[n] = o[n] && function(v) {
          return new Promise(function(resolve, reject) {
            v = o[n](v), settle(resolve, reject, v.done, v.value);
          });
        };
      }
      function settle(resolve, reject, d, v) {
        Promise.resolve(v).then(function(v2) {
          resolve({ value: v2, done: d });
        }, reject);
      }
    };
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.writeFilesystem = writeFilesystem;
    exports2.streamFilesystem = streamFilesystem;
    exports2.readArchiveHeaderSync = readArchiveHeaderSync;
    exports2.readFilesystemSync = readFilesystemSync;
    exports2.uncacheFilesystem = uncacheFilesystem;
    exports2.uncacheAll = uncacheAll;
    exports2.readFileSync = readFileSync;
    var path2 = __importStar(require("path"));
    var wrapped_fs_1 = __importDefault(require_wrapped_fs());
    var pickle_1 = require_pickle();
    var filesystem_1 = require_filesystem();
    var util_1 = require("util");
    var stream = __importStar(require("stream"));
    var pipeline = (0, util_1.promisify)(stream.pipeline);
    var filesystemCache = /* @__PURE__ */ Object.create(null);
    async function copyFile(dest, src, filename) {
      const srcFile = path2.join(src, filename);
      const targetFile = path2.join(dest, filename);
      const [content, stats] = await Promise.all([
        wrapped_fs_1.default.readFile(srcFile),
        wrapped_fs_1.default.stat(srcFile),
        wrapped_fs_1.default.mkdirp(path2.dirname(targetFile))
      ]);
      return wrapped_fs_1.default.writeFile(targetFile, content, { mode: stats.mode });
    }
    async function streamTransformedFile(stream2, outStream) {
      return new Promise((resolve, reject) => {
        stream2.pipe(outStream, { end: false });
        stream2.on("error", reject);
        stream2.on("end", () => resolve());
      });
    }
    var writeFileListToStream = async function(dest, filesystem, out, lists, metadata) {
      const { files, links } = lists;
      for (const file of files) {
        if (file.unpack) {
          const filename = path2.relative(filesystem.getRootPath(), file.filename);
          await copyFile(`${dest}.unpacked`, filesystem.getRootPath(), filename);
        } else {
          const transformed = metadata[file.filename].transformed;
          const stream2 = wrapped_fs_1.default.createReadStream(transformed ? transformed.path : file.filename);
          await streamTransformedFile(stream2, out);
        }
      }
      for (const file of links.filter((f) => f.unpack)) {
        const filename = path2.relative(filesystem.getRootPath(), file.filename);
        const link = await wrapped_fs_1.default.readlink(file.filename);
        await createSymlink(dest, filename, link);
      }
      return out.end();
    };
    async function writeFilesystem(dest, filesystem, lists, metadata) {
      const out = await createFilesystemWriteStream(filesystem, dest);
      return writeFileListToStream(dest, filesystem, out, lists, metadata);
    }
    async function streamFilesystem(dest, filesystem, lists) {
      var _a, e_1, _b, _c;
      const out = await createFilesystemWriteStream(filesystem, dest);
      const { files, links } = lists;
      try {
        for (var _d = true, files_1 = __asyncValues(files), files_1_1; files_1_1 = await files_1.next(), _a = files_1_1.done, !_a; _d = true) {
          _c = files_1_1.value;
          _d = false;
          const file = _c;
          if (file.unpack) {
            const targetFile = path2.join(`${dest}.unpacked`, file.filename);
            await wrapped_fs_1.default.mkdirp(path2.dirname(targetFile));
            const writeStream = wrapped_fs_1.default.createWriteStream(targetFile, { mode: file.mode });
            await pipeline(file.streamGenerator(), writeStream);
          } else {
            await streamTransformedFile(file.streamGenerator(), out);
          }
        }
      } catch (e_1_1) {
        e_1 = { error: e_1_1 };
      } finally {
        try {
          if (!_d && !_a && (_b = files_1.return)) await _b.call(files_1);
        } finally {
          if (e_1) throw e_1.error;
        }
      }
      for (const file of links.filter((f) => f.unpack && f.link)) {
        await createSymlink(dest, file.filename, file.link);
      }
      return out.end();
    }
    function readArchiveHeaderSync(archivePath) {
      const fd = wrapped_fs_1.default.openSync(archivePath, "r");
      let size;
      let headerBuf;
      try {
        const sizeBuf = Buffer.alloc(8);
        if (wrapped_fs_1.default.readSync(fd, sizeBuf, 0, 8, null) !== 8) {
          throw new Error("Unable to read header size");
        }
        const sizePickle = pickle_1.Pickle.createFromBuffer(sizeBuf);
        size = sizePickle.createIterator().readUInt32();
        headerBuf = Buffer.alloc(size);
        if (wrapped_fs_1.default.readSync(fd, headerBuf, 0, size, null) !== size) {
          throw new Error("Unable to read header");
        }
      } finally {
        wrapped_fs_1.default.closeSync(fd);
      }
      const headerPickle = pickle_1.Pickle.createFromBuffer(headerBuf);
      const header2 = headerPickle.createIterator().readString();
      return { headerString: header2, header: JSON.parse(header2), headerSize: size };
    }
    function readFilesystemSync(archivePath) {
      if (!filesystemCache[archivePath]) {
        const header2 = readArchiveHeaderSync(archivePath);
        const filesystem = new filesystem_1.Filesystem(archivePath);
        filesystem.setHeader(header2.header, header2.headerSize);
        filesystemCache[archivePath] = filesystem;
      }
      return filesystemCache[archivePath];
    }
    function uncacheFilesystem(archivePath) {
      if (filesystemCache[archivePath]) {
        filesystemCache[archivePath] = void 0;
        return true;
      }
      return false;
    }
    function uncacheAll() {
      filesystemCache = {};
    }
    function readFileSync(filesystem, filename, info) {
      let buffer = Buffer.alloc(info.size);
      if (info.size <= 0) {
        return buffer;
      }
      if (info.unpacked) {
        buffer = wrapped_fs_1.default.readFileSync(path2.join(`${filesystem.getRootPath()}.unpacked`, filename));
      } else {
        const fd = wrapped_fs_1.default.openSync(filesystem.getRootPath(), "r");
        try {
          const offset = 8 + filesystem.getHeaderSize() + parseInt(info.offset);
          wrapped_fs_1.default.readSync(fd, buffer, 0, info.size, offset);
        } finally {
          wrapped_fs_1.default.closeSync(fd);
        }
      }
      return buffer;
    }
    async function createFilesystemWriteStream(filesystem, dest) {
      const headerPickle = pickle_1.Pickle.createEmpty();
      headerPickle.writeString(JSON.stringify(filesystem.getHeader()));
      const headerBuf = headerPickle.toBuffer();
      const sizePickle = pickle_1.Pickle.createEmpty();
      sizePickle.writeUInt32(headerBuf.length);
      const sizeBuf = sizePickle.toBuffer();
      const out = wrapped_fs_1.default.createWriteStream(dest);
      await new Promise((resolve, reject) => {
        out.on("error", reject);
        out.write(sizeBuf);
        return out.write(headerBuf, () => resolve());
      });
      return out;
    }
    async function createSymlink(dest, filepath, link) {
      await wrapped_fs_1.default.mkdirp(path2.join(`${dest}.unpacked`, path2.dirname(filepath)));
      await wrapped_fs_1.default.symlink(link, path2.join(`${dest}.unpacked`, filepath)).catch(async (error) => {
        if (error.code === "EPERM" && error.syscall === "symlink") {
          throw new Error("Could not create symlinks for unpacked assets. On Windows, consider activating Developer Mode to allow non-admin users to create symlinks by following the instructions at https://docs.microsoft.com/en-us/windows/apps/get-started/enable-your-device-for-development.");
        }
        throw error;
      });
    }
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/fs.realpath/old.js
var require_old = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/fs.realpath/old.js"(exports2) {
    var pathModule = require("path");
    var isWindows = process.platform === "win32";
    var fs2 = require("fs");
    var DEBUG = process.env.NODE_DEBUG && /fs/.test(process.env.NODE_DEBUG);
    function rethrow() {
      var callback;
      if (DEBUG) {
        var backtrace = new Error();
        callback = debugCallback;
      } else
        callback = missingCallback;
      return callback;
      function debugCallback(err) {
        if (err) {
          backtrace.message = err.message;
          err = backtrace;
          missingCallback(err);
        }
      }
      function missingCallback(err) {
        if (err) {
          if (process.throwDeprecation)
            throw err;
          else if (!process.noDeprecation) {
            var msg = "fs: missing callback " + (err.stack || err.message);
            if (process.traceDeprecation)
              console.trace(msg);
            else
              console.error(msg);
          }
        }
      }
    }
    function maybeCallback(cb) {
      return typeof cb === "function" ? cb : rethrow();
    }
    var normalize = pathModule.normalize;
    if (isWindows) {
      nextPartRe = /(.*?)(?:[\/\\]+|$)/g;
    } else {
      nextPartRe = /(.*?)(?:[\/]+|$)/g;
    }
    var nextPartRe;
    if (isWindows) {
      splitRootRe = /^(?:[a-zA-Z]:|[\\\/]{2}[^\\\/]+[\\\/][^\\\/]+)?[\\\/]*/;
    } else {
      splitRootRe = /^[\/]*/;
    }
    var splitRootRe;
    exports2.realpathSync = function realpathSync(p, cache) {
      p = pathModule.resolve(p);
      if (cache && Object.prototype.hasOwnProperty.call(cache, p)) {
        return cache[p];
      }
      var original = p, seenLinks = {}, knownHard = {};
      var pos;
      var current;
      var base;
      var previous;
      start();
      function start() {
        var m = splitRootRe.exec(p);
        pos = m[0].length;
        current = m[0];
        base = m[0];
        previous = "";
        if (isWindows && !knownHard[base]) {
          fs2.lstatSync(base);
          knownHard[base] = true;
        }
      }
      while (pos < p.length) {
        nextPartRe.lastIndex = pos;
        var result = nextPartRe.exec(p);
        previous = current;
        current += result[0];
        base = previous + result[1];
        pos = nextPartRe.lastIndex;
        if (knownHard[base] || cache && cache[base] === base) {
          continue;
        }
        var resolvedLink;
        if (cache && Object.prototype.hasOwnProperty.call(cache, base)) {
          resolvedLink = cache[base];
        } else {
          var stat = fs2.lstatSync(base);
          if (!stat.isSymbolicLink()) {
            knownHard[base] = true;
            if (cache) cache[base] = base;
            continue;
          }
          var linkTarget = null;
          if (!isWindows) {
            var id = stat.dev.toString(32) + ":" + stat.ino.toString(32);
            if (seenLinks.hasOwnProperty(id)) {
              linkTarget = seenLinks[id];
            }
          }
          if (linkTarget === null) {
            fs2.statSync(base);
            linkTarget = fs2.readlinkSync(base);
          }
          resolvedLink = pathModule.resolve(previous, linkTarget);
          if (cache) cache[base] = resolvedLink;
          if (!isWindows) seenLinks[id] = linkTarget;
        }
        p = pathModule.resolve(resolvedLink, p.slice(pos));
        start();
      }
      if (cache) cache[original] = p;
      return p;
    };
    exports2.realpath = function realpath(p, cache, cb) {
      if (typeof cb !== "function") {
        cb = maybeCallback(cache);
        cache = null;
      }
      p = pathModule.resolve(p);
      if (cache && Object.prototype.hasOwnProperty.call(cache, p)) {
        return process.nextTick(cb.bind(null, null, cache[p]));
      }
      var original = p, seenLinks = {}, knownHard = {};
      var pos;
      var current;
      var base;
      var previous;
      start();
      function start() {
        var m = splitRootRe.exec(p);
        pos = m[0].length;
        current = m[0];
        base = m[0];
        previous = "";
        if (isWindows && !knownHard[base]) {
          fs2.lstat(base, function(err) {
            if (err) return cb(err);
            knownHard[base] = true;
            LOOP();
          });
        } else {
          process.nextTick(LOOP);
        }
      }
      function LOOP() {
        if (pos >= p.length) {
          if (cache) cache[original] = p;
          return cb(null, p);
        }
        nextPartRe.lastIndex = pos;
        var result = nextPartRe.exec(p);
        previous = current;
        current += result[0];
        base = previous + result[1];
        pos = nextPartRe.lastIndex;
        if (knownHard[base] || cache && cache[base] === base) {
          return process.nextTick(LOOP);
        }
        if (cache && Object.prototype.hasOwnProperty.call(cache, base)) {
          return gotResolvedLink(cache[base]);
        }
        return fs2.lstat(base, gotStat);
      }
      function gotStat(err, stat) {
        if (err) return cb(err);
        if (!stat.isSymbolicLink()) {
          knownHard[base] = true;
          if (cache) cache[base] = base;
          return process.nextTick(LOOP);
        }
        if (!isWindows) {
          var id = stat.dev.toString(32) + ":" + stat.ino.toString(32);
          if (seenLinks.hasOwnProperty(id)) {
            return gotTarget(null, seenLinks[id], base);
          }
        }
        fs2.stat(base, function(err2) {
          if (err2) return cb(err2);
          fs2.readlink(base, function(err3, target) {
            if (!isWindows) seenLinks[id] = target;
            gotTarget(err3, target);
          });
        });
      }
      function gotTarget(err, target, base2) {
        if (err) return cb(err);
        var resolvedLink = pathModule.resolve(previous, target);
        if (cache) cache[base2] = resolvedLink;
        gotResolvedLink(resolvedLink);
      }
      function gotResolvedLink(resolvedLink) {
        p = pathModule.resolve(resolvedLink, p.slice(pos));
        start();
      }
    };
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/fs.realpath/index.js
var require_fs = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/fs.realpath/index.js"(exports2, module2) {
    module2.exports = realpath;
    realpath.realpath = realpath;
    realpath.sync = realpathSync;
    realpath.realpathSync = realpathSync;
    realpath.monkeypatch = monkeypatch;
    realpath.unmonkeypatch = unmonkeypatch;
    var fs2 = require("fs");
    var origRealpath = fs2.realpath;
    var origRealpathSync = fs2.realpathSync;
    var version = process.version;
    var ok = /^v[0-5]\./.test(version);
    var old = require_old();
    function newError(er) {
      return er && er.syscall === "realpath" && (er.code === "ELOOP" || er.code === "ENOMEM" || er.code === "ENAMETOOLONG");
    }
    function realpath(p, cache, cb) {
      if (ok) {
        return origRealpath(p, cache, cb);
      }
      if (typeof cache === "function") {
        cb = cache;
        cache = null;
      }
      origRealpath(p, cache, function(er, result) {
        if (newError(er)) {
          old.realpath(p, cache, cb);
        } else {
          cb(er, result);
        }
      });
    }
    function realpathSync(p, cache) {
      if (ok) {
        return origRealpathSync(p, cache);
      }
      try {
        return origRealpathSync(p, cache);
      } catch (er) {
        if (newError(er)) {
          return old.realpathSync(p, cache);
        } else {
          throw er;
        }
      }
    }
    function monkeypatch() {
      fs2.realpath = realpath;
      fs2.realpathSync = realpathSync;
    }
    function unmonkeypatch() {
      fs2.realpath = origRealpath;
      fs2.realpathSync = origRealpathSync;
    }
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/inherits/inherits_browser.js
var require_inherits_browser = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/inherits/inherits_browser.js"(exports2, module2) {
    if (typeof Object.create === "function") {
      module2.exports = function inherits(ctor, superCtor) {
        if (superCtor) {
          ctor.super_ = superCtor;
          ctor.prototype = Object.create(superCtor.prototype, {
            constructor: {
              value: ctor,
              enumerable: false,
              writable: true,
              configurable: true
            }
          });
        }
      };
    } else {
      module2.exports = function inherits(ctor, superCtor) {
        if (superCtor) {
          ctor.super_ = superCtor;
          var TempCtor = function() {
          };
          TempCtor.prototype = superCtor.prototype;
          ctor.prototype = new TempCtor();
          ctor.prototype.constructor = ctor;
        }
      };
    }
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/inherits/inherits.js
var require_inherits = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/inherits/inherits.js"(exports2, module2) {
    try {
      util = require("util");
      if (typeof util.inherits !== "function") throw "";
      module2.exports = util.inherits;
    } catch (e) {
      module2.exports = require_inherits_browser();
    }
    var util;
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/path-is-absolute/index.js
var require_path_is_absolute = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/path-is-absolute/index.js"(exports2, module2) {
    "use strict";
    function posix(path2) {
      return path2.charAt(0) === "/";
    }
    function win32(path2) {
      var splitDeviceRe = /^([a-zA-Z]:|[\\\/]{2}[^\\\/]+[\\\/]+[^\\\/]+)?([\\\/])?([\s\S]*?)$/;
      var result = splitDeviceRe.exec(path2);
      var device = result[1] || "";
      var isUnc = Boolean(device && device.charAt(1) !== ":");
      return Boolean(result[2] || isUnc);
    }
    module2.exports = process.platform === "win32" ? win32 : posix;
    module2.exports.posix = posix;
    module2.exports.win32 = win32;
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/glob/common.js
var require_common = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/glob/common.js"(exports2) {
    exports2.setopts = setopts;
    exports2.ownProp = ownProp;
    exports2.makeAbs = makeAbs;
    exports2.finish = finish;
    exports2.mark = mark;
    exports2.isIgnored = isIgnored;
    exports2.childrenIgnored = childrenIgnored;
    function ownProp(obj, field) {
      return Object.prototype.hasOwnProperty.call(obj, field);
    }
    var fs2 = require("fs");
    var path2 = require("path");
    var minimatch = require_minimatch();
    var isAbsolute = require_path_is_absolute();
    var Minimatch = minimatch.Minimatch;
    function alphasort(a, b) {
      return a.localeCompare(b, "en");
    }
    function setupIgnores(self, options) {
      self.ignore = options.ignore || [];
      if (!Array.isArray(self.ignore))
        self.ignore = [self.ignore];
      if (self.ignore.length) {
        self.ignore = self.ignore.map(ignoreMap);
      }
    }
    function ignoreMap(pattern) {
      var gmatcher = null;
      if (pattern.slice(-3) === "/**") {
        var gpattern = pattern.replace(/(\/\*\*)+$/, "");
        gmatcher = new Minimatch(gpattern, { dot: true });
      }
      return {
        matcher: new Minimatch(pattern, { dot: true }),
        gmatcher
      };
    }
    function setopts(self, pattern, options) {
      if (!options)
        options = {};
      if (options.matchBase && -1 === pattern.indexOf("/")) {
        if (options.noglobstar) {
          throw new Error("base matching requires globstar");
        }
        pattern = "**/" + pattern;
      }
      self.silent = !!options.silent;
      self.pattern = pattern;
      self.strict = options.strict !== false;
      self.realpath = !!options.realpath;
      self.realpathCache = options.realpathCache || /* @__PURE__ */ Object.create(null);
      self.follow = !!options.follow;
      self.dot = !!options.dot;
      self.mark = !!options.mark;
      self.nodir = !!options.nodir;
      if (self.nodir)
        self.mark = true;
      self.sync = !!options.sync;
      self.nounique = !!options.nounique;
      self.nonull = !!options.nonull;
      self.nosort = !!options.nosort;
      self.nocase = !!options.nocase;
      self.stat = !!options.stat;
      self.noprocess = !!options.noprocess;
      self.absolute = !!options.absolute;
      self.fs = options.fs || fs2;
      self.maxLength = options.maxLength || Infinity;
      self.cache = options.cache || /* @__PURE__ */ Object.create(null);
      self.statCache = options.statCache || /* @__PURE__ */ Object.create(null);
      self.symlinks = options.symlinks || /* @__PURE__ */ Object.create(null);
      setupIgnores(self, options);
      self.changedCwd = false;
      var cwd = process.cwd();
      if (!ownProp(options, "cwd"))
        self.cwd = cwd;
      else {
        self.cwd = path2.resolve(options.cwd);
        self.changedCwd = self.cwd !== cwd;
      }
      self.root = options.root || path2.resolve(self.cwd, "/");
      self.root = path2.resolve(self.root);
      if (process.platform === "win32")
        self.root = self.root.replace(/\\/g, "/");
      self.cwdAbs = isAbsolute(self.cwd) ? self.cwd : makeAbs(self, self.cwd);
      if (process.platform === "win32")
        self.cwdAbs = self.cwdAbs.replace(/\\/g, "/");
      self.nomount = !!options.nomount;
      options.nonegate = true;
      options.nocomment = true;
      options.allowWindowsEscape = false;
      self.minimatch = new Minimatch(pattern, options);
      self.options = self.minimatch.options;
    }
    function finish(self) {
      var nou = self.nounique;
      var all = nou ? [] : /* @__PURE__ */ Object.create(null);
      for (var i = 0, l = self.matches.length; i < l; i++) {
        var matches = self.matches[i];
        if (!matches || Object.keys(matches).length === 0) {
          if (self.nonull) {
            var literal = self.minimatch.globSet[i];
            if (nou)
              all.push(literal);
            else
              all[literal] = true;
          }
        } else {
          var m = Object.keys(matches);
          if (nou)
            all.push.apply(all, m);
          else
            m.forEach(function(m2) {
              all[m2] = true;
            });
        }
      }
      if (!nou)
        all = Object.keys(all);
      if (!self.nosort)
        all = all.sort(alphasort);
      if (self.mark) {
        for (var i = 0; i < all.length; i++) {
          all[i] = self._mark(all[i]);
        }
        if (self.nodir) {
          all = all.filter(function(e) {
            var notDir = !/\/$/.test(e);
            var c = self.cache[e] || self.cache[makeAbs(self, e)];
            if (notDir && c)
              notDir = c !== "DIR" && !Array.isArray(c);
            return notDir;
          });
        }
      }
      if (self.ignore.length)
        all = all.filter(function(m2) {
          return !isIgnored(self, m2);
        });
      self.found = all;
    }
    function mark(self, p) {
      var abs = makeAbs(self, p);
      var c = self.cache[abs];
      var m = p;
      if (c) {
        var isDir = c === "DIR" || Array.isArray(c);
        var slash = p.slice(-1) === "/";
        if (isDir && !slash)
          m += "/";
        else if (!isDir && slash)
          m = m.slice(0, -1);
        if (m !== p) {
          var mabs = makeAbs(self, m);
          self.statCache[mabs] = self.statCache[abs];
          self.cache[mabs] = self.cache[abs];
        }
      }
      return m;
    }
    function makeAbs(self, f) {
      var abs = f;
      if (f.charAt(0) === "/") {
        abs = path2.join(self.root, f);
      } else if (isAbsolute(f) || f === "") {
        abs = f;
      } else if (self.changedCwd) {
        abs = path2.resolve(self.cwd, f);
      } else {
        abs = path2.resolve(f);
      }
      if (process.platform === "win32")
        abs = abs.replace(/\\/g, "/");
      return abs;
    }
    function isIgnored(self, path3) {
      if (!self.ignore.length)
        return false;
      return self.ignore.some(function(item) {
        return item.matcher.match(path3) || !!(item.gmatcher && item.gmatcher.match(path3));
      });
    }
    function childrenIgnored(self, path3) {
      if (!self.ignore.length)
        return false;
      return self.ignore.some(function(item) {
        return !!(item.gmatcher && item.gmatcher.match(path3));
      });
    }
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/glob/sync.js
var require_sync = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/glob/sync.js"(exports2, module2) {
    module2.exports = globSync;
    globSync.GlobSync = GlobSync;
    var rp = require_fs();
    var minimatch = require_minimatch();
    var Minimatch = minimatch.Minimatch;
    var Glob = require_glob().Glob;
    var util = require("util");
    var path2 = require("path");
    var assert = require("assert");
    var isAbsolute = require_path_is_absolute();
    var common = require_common();
    var setopts = common.setopts;
    var ownProp = common.ownProp;
    var childrenIgnored = common.childrenIgnored;
    var isIgnored = common.isIgnored;
    function globSync(pattern, options) {
      if (typeof options === "function" || arguments.length === 3)
        throw new TypeError("callback provided to sync glob\nSee: https://github.com/isaacs/node-glob/issues/167");
      return new GlobSync(pattern, options).found;
    }
    function GlobSync(pattern, options) {
      if (!pattern)
        throw new Error("must provide pattern");
      if (typeof options === "function" || arguments.length === 3)
        throw new TypeError("callback provided to sync glob\nSee: https://github.com/isaacs/node-glob/issues/167");
      if (!(this instanceof GlobSync))
        return new GlobSync(pattern, options);
      setopts(this, pattern, options);
      if (this.noprocess)
        return this;
      var n = this.minimatch.set.length;
      this.matches = new Array(n);
      for (var i = 0; i < n; i++) {
        this._process(this.minimatch.set[i], i, false);
      }
      this._finish();
    }
    GlobSync.prototype._finish = function() {
      assert.ok(this instanceof GlobSync);
      if (this.realpath) {
        var self = this;
        this.matches.forEach(function(matchset, index) {
          var set = self.matches[index] = /* @__PURE__ */ Object.create(null);
          for (var p in matchset) {
            try {
              p = self._makeAbs(p);
              var real = rp.realpathSync(p, self.realpathCache);
              set[real] = true;
            } catch (er) {
              if (er.syscall === "stat")
                set[self._makeAbs(p)] = true;
              else
                throw er;
            }
          }
        });
      }
      common.finish(this);
    };
    GlobSync.prototype._process = function(pattern, index, inGlobStar) {
      assert.ok(this instanceof GlobSync);
      var n = 0;
      while (typeof pattern[n] === "string") {
        n++;
      }
      var prefix;
      switch (n) {
        // if not, then this is rather simple
        case pattern.length:
          this._processSimple(pattern.join("/"), index);
          return;
        case 0:
          prefix = null;
          break;
        default:
          prefix = pattern.slice(0, n).join("/");
          break;
      }
      var remain = pattern.slice(n);
      var read;
      if (prefix === null)
        read = ".";
      else if (isAbsolute(prefix) || isAbsolute(pattern.map(function(p) {
        return typeof p === "string" ? p : "[*]";
      }).join("/"))) {
        if (!prefix || !isAbsolute(prefix))
          prefix = "/" + prefix;
        read = prefix;
      } else
        read = prefix;
      var abs = this._makeAbs(read);
      if (childrenIgnored(this, read))
        return;
      var isGlobStar = remain[0] === minimatch.GLOBSTAR;
      if (isGlobStar)
        this._processGlobStar(prefix, read, abs, remain, index, inGlobStar);
      else
        this._processReaddir(prefix, read, abs, remain, index, inGlobStar);
    };
    GlobSync.prototype._processReaddir = function(prefix, read, abs, remain, index, inGlobStar) {
      var entries2 = this._readdir(abs, inGlobStar);
      if (!entries2)
        return;
      var pn = remain[0];
      var negate = !!this.minimatch.negate;
      var rawGlob = pn._glob;
      var dotOk = this.dot || rawGlob.charAt(0) === ".";
      var matchedEntries = [];
      for (var i = 0; i < entries2.length; i++) {
        var e = entries2[i];
        if (e.charAt(0) !== "." || dotOk) {
          var m;
          if (negate && !prefix) {
            m = !e.match(pn);
          } else {
            m = e.match(pn);
          }
          if (m)
            matchedEntries.push(e);
        }
      }
      var len = matchedEntries.length;
      if (len === 0)
        return;
      if (remain.length === 1 && !this.mark && !this.stat) {
        if (!this.matches[index])
          this.matches[index] = /* @__PURE__ */ Object.create(null);
        for (var i = 0; i < len; i++) {
          var e = matchedEntries[i];
          if (prefix) {
            if (prefix.slice(-1) !== "/")
              e = prefix + "/" + e;
            else
              e = prefix + e;
          }
          if (e.charAt(0) === "/" && !this.nomount) {
            e = path2.join(this.root, e);
          }
          this._emitMatch(index, e);
        }
        return;
      }
      remain.shift();
      for (var i = 0; i < len; i++) {
        var e = matchedEntries[i];
        var newPattern;
        if (prefix)
          newPattern = [prefix, e];
        else
          newPattern = [e];
        this._process(newPattern.concat(remain), index, inGlobStar);
      }
    };
    GlobSync.prototype._emitMatch = function(index, e) {
      if (isIgnored(this, e))
        return;
      var abs = this._makeAbs(e);
      if (this.mark)
        e = this._mark(e);
      if (this.absolute) {
        e = abs;
      }
      if (this.matches[index][e])
        return;
      if (this.nodir) {
        var c = this.cache[abs];
        if (c === "DIR" || Array.isArray(c))
          return;
      }
      this.matches[index][e] = true;
      if (this.stat)
        this._stat(e);
    };
    GlobSync.prototype._readdirInGlobStar = function(abs) {
      if (this.follow)
        return this._readdir(abs, false);
      var entries2;
      var lstat;
      var stat;
      try {
        lstat = this.fs.lstatSync(abs);
      } catch (er) {
        if (er.code === "ENOENT") {
          return null;
        }
      }
      var isSym = lstat && lstat.isSymbolicLink();
      this.symlinks[abs] = isSym;
      if (!isSym && lstat && !lstat.isDirectory())
        this.cache[abs] = "FILE";
      else
        entries2 = this._readdir(abs, false);
      return entries2;
    };
    GlobSync.prototype._readdir = function(abs, inGlobStar) {
      var entries2;
      if (inGlobStar && !ownProp(this.symlinks, abs))
        return this._readdirInGlobStar(abs);
      if (ownProp(this.cache, abs)) {
        var c = this.cache[abs];
        if (!c || c === "FILE")
          return null;
        if (Array.isArray(c))
          return c;
      }
      try {
        return this._readdirEntries(abs, this.fs.readdirSync(abs));
      } catch (er) {
        this._readdirError(abs, er);
        return null;
      }
    };
    GlobSync.prototype._readdirEntries = function(abs, entries2) {
      if (!this.mark && !this.stat) {
        for (var i = 0; i < entries2.length; i++) {
          var e = entries2[i];
          if (abs === "/")
            e = abs + e;
          else
            e = abs + "/" + e;
          this.cache[e] = true;
        }
      }
      this.cache[abs] = entries2;
      return entries2;
    };
    GlobSync.prototype._readdirError = function(f, er) {
      switch (er.code) {
        case "ENOTSUP":
        // https://github.com/isaacs/node-glob/issues/205
        case "ENOTDIR":
          var abs = this._makeAbs(f);
          this.cache[abs] = "FILE";
          if (abs === this.cwdAbs) {
            var error = new Error(er.code + " invalid cwd " + this.cwd);
            error.path = this.cwd;
            error.code = er.code;
            throw error;
          }
          break;
        case "ENOENT":
        // not terribly unusual
        case "ELOOP":
        case "ENAMETOOLONG":
        case "UNKNOWN":
          this.cache[this._makeAbs(f)] = false;
          break;
        default:
          this.cache[this._makeAbs(f)] = false;
          if (this.strict)
            throw er;
          if (!this.silent)
            console.error("glob error", er);
          break;
      }
    };
    GlobSync.prototype._processGlobStar = function(prefix, read, abs, remain, index, inGlobStar) {
      var entries2 = this._readdir(abs, inGlobStar);
      if (!entries2)
        return;
      var remainWithoutGlobStar = remain.slice(1);
      var gspref = prefix ? [prefix] : [];
      var noGlobStar = gspref.concat(remainWithoutGlobStar);
      this._process(noGlobStar, index, false);
      var len = entries2.length;
      var isSym = this.symlinks[abs];
      if (isSym && inGlobStar)
        return;
      for (var i = 0; i < len; i++) {
        var e = entries2[i];
        if (e.charAt(0) === "." && !this.dot)
          continue;
        var instead = gspref.concat(entries2[i], remainWithoutGlobStar);
        this._process(instead, index, true);
        var below = gspref.concat(entries2[i], remain);
        this._process(below, index, true);
      }
    };
    GlobSync.prototype._processSimple = function(prefix, index) {
      var exists = this._stat(prefix);
      if (!this.matches[index])
        this.matches[index] = /* @__PURE__ */ Object.create(null);
      if (!exists)
        return;
      if (prefix && isAbsolute(prefix) && !this.nomount) {
        var trail = /[\/\\]$/.test(prefix);
        if (prefix.charAt(0) === "/") {
          prefix = path2.join(this.root, prefix);
        } else {
          prefix = path2.resolve(this.root, prefix);
          if (trail)
            prefix += "/";
        }
      }
      if (process.platform === "win32")
        prefix = prefix.replace(/\\/g, "/");
      this._emitMatch(index, prefix);
    };
    GlobSync.prototype._stat = function(f) {
      var abs = this._makeAbs(f);
      var needDir = f.slice(-1) === "/";
      if (f.length > this.maxLength)
        return false;
      if (!this.stat && ownProp(this.cache, abs)) {
        var c = this.cache[abs];
        if (Array.isArray(c))
          c = "DIR";
        if (!needDir || c === "DIR")
          return c;
        if (needDir && c === "FILE")
          return false;
      }
      var exists;
      var stat = this.statCache[abs];
      if (!stat) {
        var lstat;
        try {
          lstat = this.fs.lstatSync(abs);
        } catch (er) {
          if (er && (er.code === "ENOENT" || er.code === "ENOTDIR")) {
            this.statCache[abs] = false;
            return false;
          }
        }
        if (lstat && lstat.isSymbolicLink()) {
          try {
            stat = this.fs.statSync(abs);
          } catch (er) {
            stat = lstat;
          }
        } else {
          stat = lstat;
        }
      }
      this.statCache[abs] = stat;
      var c = true;
      if (stat)
        c = stat.isDirectory() ? "DIR" : "FILE";
      this.cache[abs] = this.cache[abs] || c;
      if (needDir && c === "FILE")
        return false;
      return c;
    };
    GlobSync.prototype._mark = function(p) {
      return common.mark(this, p);
    };
    GlobSync.prototype._makeAbs = function(f) {
      return common.makeAbs(this, f);
    };
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/wrappy/wrappy.js
var require_wrappy = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/wrappy/wrappy.js"(exports2, module2) {
    module2.exports = wrappy;
    function wrappy(fn, cb) {
      if (fn && cb) return wrappy(fn)(cb);
      if (typeof fn !== "function")
        throw new TypeError("need wrapper function");
      Object.keys(fn).forEach(function(k) {
        wrapper[k] = fn[k];
      });
      return wrapper;
      function wrapper() {
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; i++) {
          args[i] = arguments[i];
        }
        var ret = fn.apply(this, args);
        var cb2 = args[args.length - 1];
        if (typeof ret === "function" && ret !== cb2) {
          Object.keys(cb2).forEach(function(k) {
            ret[k] = cb2[k];
          });
        }
        return ret;
      }
    }
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/once/once.js
var require_once = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/once/once.js"(exports2, module2) {
    var wrappy = require_wrappy();
    module2.exports = wrappy(once);
    module2.exports.strict = wrappy(onceStrict);
    once.proto = once(function() {
      Object.defineProperty(Function.prototype, "once", {
        value: function() {
          return once(this);
        },
        configurable: true
      });
      Object.defineProperty(Function.prototype, "onceStrict", {
        value: function() {
          return onceStrict(this);
        },
        configurable: true
      });
    });
    function once(fn) {
      var f = function() {
        if (f.called) return f.value;
        f.called = true;
        return f.value = fn.apply(this, arguments);
      };
      f.called = false;
      return f;
    }
    function onceStrict(fn) {
      var f = function() {
        if (f.called)
          throw new Error(f.onceError);
        f.called = true;
        return f.value = fn.apply(this, arguments);
      };
      var name = fn.name || "Function wrapped with `once`";
      f.onceError = name + " shouldn't be called more than once";
      f.called = false;
      return f;
    }
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/inflight/inflight.js
var require_inflight = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/inflight/inflight.js"(exports2, module2) {
    var wrappy = require_wrappy();
    var reqs = /* @__PURE__ */ Object.create(null);
    var once = require_once();
    module2.exports = wrappy(inflight);
    function inflight(key, cb) {
      if (reqs[key]) {
        reqs[key].push(cb);
        return null;
      } else {
        reqs[key] = [cb];
        return makeres(key);
      }
    }
    function makeres(key) {
      return once(function RES() {
        var cbs = reqs[key];
        var len = cbs.length;
        var args = slice(arguments);
        try {
          for (var i = 0; i < len; i++) {
            cbs[i].apply(null, args);
          }
        } finally {
          if (cbs.length > len) {
            cbs.splice(0, len);
            process.nextTick(function() {
              RES.apply(null, args);
            });
          } else {
            delete reqs[key];
          }
        }
      });
    }
    function slice(args) {
      var length = args.length;
      var array = [];
      for (var i = 0; i < length; i++) array[i] = args[i];
      return array;
    }
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/glob/glob.js
var require_glob = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/glob/glob.js"(exports2, module2) {
    module2.exports = glob;
    var rp = require_fs();
    var minimatch = require_minimatch();
    var Minimatch = minimatch.Minimatch;
    var inherits = require_inherits();
    var EE = require("events").EventEmitter;
    var path2 = require("path");
    var assert = require("assert");
    var isAbsolute = require_path_is_absolute();
    var globSync = require_sync();
    var common = require_common();
    var setopts = common.setopts;
    var ownProp = common.ownProp;
    var inflight = require_inflight();
    var util = require("util");
    var childrenIgnored = common.childrenIgnored;
    var isIgnored = common.isIgnored;
    var once = require_once();
    function glob(pattern, options, cb) {
      if (typeof options === "function") cb = options, options = {};
      if (!options) options = {};
      if (options.sync) {
        if (cb)
          throw new TypeError("callback provided to sync glob");
        return globSync(pattern, options);
      }
      return new Glob(pattern, options, cb);
    }
    glob.sync = globSync;
    var GlobSync = glob.GlobSync = globSync.GlobSync;
    glob.glob = glob;
    function extend(origin, add) {
      if (add === null || typeof add !== "object") {
        return origin;
      }
      var keys = Object.keys(add);
      var i = keys.length;
      while (i--) {
        origin[keys[i]] = add[keys[i]];
      }
      return origin;
    }
    glob.hasMagic = function(pattern, options_) {
      var options = extend({}, options_);
      options.noprocess = true;
      var g = new Glob(pattern, options);
      var set = g.minimatch.set;
      if (!pattern)
        return false;
      if (set.length > 1)
        return true;
      for (var j = 0; j < set[0].length; j++) {
        if (typeof set[0][j] !== "string")
          return true;
      }
      return false;
    };
    glob.Glob = Glob;
    inherits(Glob, EE);
    function Glob(pattern, options, cb) {
      if (typeof options === "function") {
        cb = options;
        options = null;
      }
      if (options && options.sync) {
        if (cb)
          throw new TypeError("callback provided to sync glob");
        return new GlobSync(pattern, options);
      }
      if (!(this instanceof Glob))
        return new Glob(pattern, options, cb);
      setopts(this, pattern, options);
      this._didRealPath = false;
      var n = this.minimatch.set.length;
      this.matches = new Array(n);
      if (typeof cb === "function") {
        cb = once(cb);
        this.on("error", cb);
        this.on("end", function(matches) {
          cb(null, matches);
        });
      }
      var self = this;
      this._processing = 0;
      this._emitQueue = [];
      this._processQueue = [];
      this.paused = false;
      if (this.noprocess)
        return this;
      if (n === 0)
        return done();
      var sync = true;
      for (var i = 0; i < n; i++) {
        this._process(this.minimatch.set[i], i, false, done);
      }
      sync = false;
      function done() {
        --self._processing;
        if (self._processing <= 0) {
          if (sync) {
            process.nextTick(function() {
              self._finish();
            });
          } else {
            self._finish();
          }
        }
      }
    }
    Glob.prototype._finish = function() {
      assert(this instanceof Glob);
      if (this.aborted)
        return;
      if (this.realpath && !this._didRealpath)
        return this._realpath();
      common.finish(this);
      this.emit("end", this.found);
    };
    Glob.prototype._realpath = function() {
      if (this._didRealpath)
        return;
      this._didRealpath = true;
      var n = this.matches.length;
      if (n === 0)
        return this._finish();
      var self = this;
      for (var i = 0; i < this.matches.length; i++)
        this._realpathSet(i, next);
      function next() {
        if (--n === 0)
          self._finish();
      }
    };
    Glob.prototype._realpathSet = function(index, cb) {
      var matchset = this.matches[index];
      if (!matchset)
        return cb();
      var found = Object.keys(matchset);
      var self = this;
      var n = found.length;
      if (n === 0)
        return cb();
      var set = this.matches[index] = /* @__PURE__ */ Object.create(null);
      found.forEach(function(p, i) {
        p = self._makeAbs(p);
        rp.realpath(p, self.realpathCache, function(er, real) {
          if (!er)
            set[real] = true;
          else if (er.syscall === "stat")
            set[p] = true;
          else
            self.emit("error", er);
          if (--n === 0) {
            self.matches[index] = set;
            cb();
          }
        });
      });
    };
    Glob.prototype._mark = function(p) {
      return common.mark(this, p);
    };
    Glob.prototype._makeAbs = function(f) {
      return common.makeAbs(this, f);
    };
    Glob.prototype.abort = function() {
      this.aborted = true;
      this.emit("abort");
    };
    Glob.prototype.pause = function() {
      if (!this.paused) {
        this.paused = true;
        this.emit("pause");
      }
    };
    Glob.prototype.resume = function() {
      if (this.paused) {
        this.emit("resume");
        this.paused = false;
        if (this._emitQueue.length) {
          var eq = this._emitQueue.slice(0);
          this._emitQueue.length = 0;
          for (var i = 0; i < eq.length; i++) {
            var e = eq[i];
            this._emitMatch(e[0], e[1]);
          }
        }
        if (this._processQueue.length) {
          var pq = this._processQueue.slice(0);
          this._processQueue.length = 0;
          for (var i = 0; i < pq.length; i++) {
            var p = pq[i];
            this._processing--;
            this._process(p[0], p[1], p[2], p[3]);
          }
        }
      }
    };
    Glob.prototype._process = function(pattern, index, inGlobStar, cb) {
      assert(this instanceof Glob);
      assert(typeof cb === "function");
      if (this.aborted)
        return;
      this._processing++;
      if (this.paused) {
        this._processQueue.push([pattern, index, inGlobStar, cb]);
        return;
      }
      var n = 0;
      while (typeof pattern[n] === "string") {
        n++;
      }
      var prefix;
      switch (n) {
        // if not, then this is rather simple
        case pattern.length:
          this._processSimple(pattern.join("/"), index, cb);
          return;
        case 0:
          prefix = null;
          break;
        default:
          prefix = pattern.slice(0, n).join("/");
          break;
      }
      var remain = pattern.slice(n);
      var read;
      if (prefix === null)
        read = ".";
      else if (isAbsolute(prefix) || isAbsolute(pattern.map(function(p) {
        return typeof p === "string" ? p : "[*]";
      }).join("/"))) {
        if (!prefix || !isAbsolute(prefix))
          prefix = "/" + prefix;
        read = prefix;
      } else
        read = prefix;
      var abs = this._makeAbs(read);
      if (childrenIgnored(this, read))
        return cb();
      var isGlobStar = remain[0] === minimatch.GLOBSTAR;
      if (isGlobStar)
        this._processGlobStar(prefix, read, abs, remain, index, inGlobStar, cb);
      else
        this._processReaddir(prefix, read, abs, remain, index, inGlobStar, cb);
    };
    Glob.prototype._processReaddir = function(prefix, read, abs, remain, index, inGlobStar, cb) {
      var self = this;
      this._readdir(abs, inGlobStar, function(er, entries2) {
        return self._processReaddir2(prefix, read, abs, remain, index, inGlobStar, entries2, cb);
      });
    };
    Glob.prototype._processReaddir2 = function(prefix, read, abs, remain, index, inGlobStar, entries2, cb) {
      if (!entries2)
        return cb();
      var pn = remain[0];
      var negate = !!this.minimatch.negate;
      var rawGlob = pn._glob;
      var dotOk = this.dot || rawGlob.charAt(0) === ".";
      var matchedEntries = [];
      for (var i = 0; i < entries2.length; i++) {
        var e = entries2[i];
        if (e.charAt(0) !== "." || dotOk) {
          var m;
          if (negate && !prefix) {
            m = !e.match(pn);
          } else {
            m = e.match(pn);
          }
          if (m)
            matchedEntries.push(e);
        }
      }
      var len = matchedEntries.length;
      if (len === 0)
        return cb();
      if (remain.length === 1 && !this.mark && !this.stat) {
        if (!this.matches[index])
          this.matches[index] = /* @__PURE__ */ Object.create(null);
        for (var i = 0; i < len; i++) {
          var e = matchedEntries[i];
          if (prefix) {
            if (prefix !== "/")
              e = prefix + "/" + e;
            else
              e = prefix + e;
          }
          if (e.charAt(0) === "/" && !this.nomount) {
            e = path2.join(this.root, e);
          }
          this._emitMatch(index, e);
        }
        return cb();
      }
      remain.shift();
      for (var i = 0; i < len; i++) {
        var e = matchedEntries[i];
        var newPattern;
        if (prefix) {
          if (prefix !== "/")
            e = prefix + "/" + e;
          else
            e = prefix + e;
        }
        this._process([e].concat(remain), index, inGlobStar, cb);
      }
      cb();
    };
    Glob.prototype._emitMatch = function(index, e) {
      if (this.aborted)
        return;
      if (isIgnored(this, e))
        return;
      if (this.paused) {
        this._emitQueue.push([index, e]);
        return;
      }
      var abs = isAbsolute(e) ? e : this._makeAbs(e);
      if (this.mark)
        e = this._mark(e);
      if (this.absolute)
        e = abs;
      if (this.matches[index][e])
        return;
      if (this.nodir) {
        var c = this.cache[abs];
        if (c === "DIR" || Array.isArray(c))
          return;
      }
      this.matches[index][e] = true;
      var st = this.statCache[abs];
      if (st)
        this.emit("stat", e, st);
      this.emit("match", e);
    };
    Glob.prototype._readdirInGlobStar = function(abs, cb) {
      if (this.aborted)
        return;
      if (this.follow)
        return this._readdir(abs, false, cb);
      var lstatkey = "lstat\0" + abs;
      var self = this;
      var lstatcb = inflight(lstatkey, lstatcb_);
      if (lstatcb)
        self.fs.lstat(abs, lstatcb);
      function lstatcb_(er, lstat) {
        if (er && er.code === "ENOENT")
          return cb();
        var isSym = lstat && lstat.isSymbolicLink();
        self.symlinks[abs] = isSym;
        if (!isSym && lstat && !lstat.isDirectory()) {
          self.cache[abs] = "FILE";
          cb();
        } else
          self._readdir(abs, false, cb);
      }
    };
    Glob.prototype._readdir = function(abs, inGlobStar, cb) {
      if (this.aborted)
        return;
      cb = inflight("readdir\0" + abs + "\0" + inGlobStar, cb);
      if (!cb)
        return;
      if (inGlobStar && !ownProp(this.symlinks, abs))
        return this._readdirInGlobStar(abs, cb);
      if (ownProp(this.cache, abs)) {
        var c = this.cache[abs];
        if (!c || c === "FILE")
          return cb();
        if (Array.isArray(c))
          return cb(null, c);
      }
      var self = this;
      self.fs.readdir(abs, readdirCb(this, abs, cb));
    };
    function readdirCb(self, abs, cb) {
      return function(er, entries2) {
        if (er)
          self._readdirError(abs, er, cb);
        else
          self._readdirEntries(abs, entries2, cb);
      };
    }
    Glob.prototype._readdirEntries = function(abs, entries2, cb) {
      if (this.aborted)
        return;
      if (!this.mark && !this.stat) {
        for (var i = 0; i < entries2.length; i++) {
          var e = entries2[i];
          if (abs === "/")
            e = abs + e;
          else
            e = abs + "/" + e;
          this.cache[e] = true;
        }
      }
      this.cache[abs] = entries2;
      return cb(null, entries2);
    };
    Glob.prototype._readdirError = function(f, er, cb) {
      if (this.aborted)
        return;
      switch (er.code) {
        case "ENOTSUP":
        // https://github.com/isaacs/node-glob/issues/205
        case "ENOTDIR":
          var abs = this._makeAbs(f);
          this.cache[abs] = "FILE";
          if (abs === this.cwdAbs) {
            var error = new Error(er.code + " invalid cwd " + this.cwd);
            error.path = this.cwd;
            error.code = er.code;
            this.emit("error", error);
            this.abort();
          }
          break;
        case "ENOENT":
        // not terribly unusual
        case "ELOOP":
        case "ENAMETOOLONG":
        case "UNKNOWN":
          this.cache[this._makeAbs(f)] = false;
          break;
        default:
          this.cache[this._makeAbs(f)] = false;
          if (this.strict) {
            this.emit("error", er);
            this.abort();
          }
          if (!this.silent)
            console.error("glob error", er);
          break;
      }
      return cb();
    };
    Glob.prototype._processGlobStar = function(prefix, read, abs, remain, index, inGlobStar, cb) {
      var self = this;
      this._readdir(abs, inGlobStar, function(er, entries2) {
        self._processGlobStar2(prefix, read, abs, remain, index, inGlobStar, entries2, cb);
      });
    };
    Glob.prototype._processGlobStar2 = function(prefix, read, abs, remain, index, inGlobStar, entries2, cb) {
      if (!entries2)
        return cb();
      var remainWithoutGlobStar = remain.slice(1);
      var gspref = prefix ? [prefix] : [];
      var noGlobStar = gspref.concat(remainWithoutGlobStar);
      this._process(noGlobStar, index, false, cb);
      var isSym = this.symlinks[abs];
      var len = entries2.length;
      if (isSym && inGlobStar)
        return cb();
      for (var i = 0; i < len; i++) {
        var e = entries2[i];
        if (e.charAt(0) === "." && !this.dot)
          continue;
        var instead = gspref.concat(entries2[i], remainWithoutGlobStar);
        this._process(instead, index, true, cb);
        var below = gspref.concat(entries2[i], remain);
        this._process(below, index, true, cb);
      }
      cb();
    };
    Glob.prototype._processSimple = function(prefix, index, cb) {
      var self = this;
      this._stat(prefix, function(er, exists) {
        self._processSimple2(prefix, index, er, exists, cb);
      });
    };
    Glob.prototype._processSimple2 = function(prefix, index, er, exists, cb) {
      if (!this.matches[index])
        this.matches[index] = /* @__PURE__ */ Object.create(null);
      if (!exists)
        return cb();
      if (prefix && isAbsolute(prefix) && !this.nomount) {
        var trail = /[\/\\]$/.test(prefix);
        if (prefix.charAt(0) === "/") {
          prefix = path2.join(this.root, prefix);
        } else {
          prefix = path2.resolve(this.root, prefix);
          if (trail)
            prefix += "/";
        }
      }
      if (process.platform === "win32")
        prefix = prefix.replace(/\\/g, "/");
      this._emitMatch(index, prefix);
      cb();
    };
    Glob.prototype._stat = function(f, cb) {
      var abs = this._makeAbs(f);
      var needDir = f.slice(-1) === "/";
      if (f.length > this.maxLength)
        return cb();
      if (!this.stat && ownProp(this.cache, abs)) {
        var c = this.cache[abs];
        if (Array.isArray(c))
          c = "DIR";
        if (!needDir || c === "DIR")
          return cb(null, c);
        if (needDir && c === "FILE")
          return cb();
      }
      var exists;
      var stat = this.statCache[abs];
      if (stat !== void 0) {
        if (stat === false)
          return cb(null, stat);
        else {
          var type = stat.isDirectory() ? "DIR" : "FILE";
          if (needDir && type === "FILE")
            return cb();
          else
            return cb(null, type, stat);
        }
      }
      var self = this;
      var statcb = inflight("stat\0" + abs, lstatcb_);
      if (statcb)
        self.fs.lstat(abs, statcb);
      function lstatcb_(er, lstat) {
        if (lstat && lstat.isSymbolicLink()) {
          return self.fs.stat(abs, function(er2, stat2) {
            if (er2)
              self._stat2(f, abs, null, lstat, cb);
            else
              self._stat2(f, abs, er2, stat2, cb);
          });
        } else {
          self._stat2(f, abs, er, lstat, cb);
        }
      }
    };
    Glob.prototype._stat2 = function(f, abs, er, stat, cb) {
      if (er && (er.code === "ENOENT" || er.code === "ENOTDIR")) {
        this.statCache[abs] = false;
        return cb();
      }
      var needDir = f.slice(-1) === "/";
      this.statCache[abs] = stat;
      if (abs.slice(-1) === "/" && stat && !stat.isDirectory())
        return cb(null, false, stat);
      var c = true;
      if (stat)
        c = stat.isDirectory() ? "DIR" : "FILE";
      this.cache[abs] = this.cache[abs] || c;
      if (needDir && c === "FILE")
        return cb();
      return cb(null, c, stat);
    };
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/@electron/asar/lib/crawlfs.js
var require_crawlfs = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/@electron/asar/lib/crawlfs.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.determineFileType = determineFileType;
    exports2.crawl = crawl;
    var util_1 = require("util");
    var glob_1 = require_glob();
    var wrapped_fs_1 = __importDefault(require_wrapped_fs());
    var path2 = __importStar(require("path"));
    var glob = (0, util_1.promisify)(glob_1.glob);
    async function determineFileType(filename) {
      const stat = await wrapped_fs_1.default.lstat(filename);
      if (stat.isFile()) {
        return { type: "file", stat };
      } else if (stat.isDirectory()) {
        return { type: "directory", stat };
      } else if (stat.isSymbolicLink()) {
        return { type: "link", stat };
      }
      return null;
    }
    async function crawl(dir, options) {
      const metadata = {};
      const crawled = await glob(dir, options);
      const results = await Promise.all(crawled.map(async (filename) => [filename, await determineFileType(filename)]));
      const links = [];
      const filenames = results.map(([filename, type]) => {
        if (type) {
          metadata[filename] = type;
          if (type.type === "link")
            links.push(filename);
        }
        return filename;
      }).filter((filename) => {
        const exactLinkIndex = links.findIndex((link) => filename === link);
        return links.every((link, index) => {
          if (index === exactLinkIndex) {
            return true;
          }
          const isFileWithinSymlinkDir = filename.startsWith(link);
          const relativePath = path2.relative(link, path2.dirname(filename));
          return !isFileWithinSymlinkDir || relativePath.startsWith("..");
        });
      });
      return [filenames, metadata];
    }
  }
});

// ../../../../../.npm/_npx/1a762337c8d778b9/node_modules/@electron/asar/lib/asar.js
var require_asar = __commonJS({
  "../../../../../.npm/_npx/1a762337c8d778b9/node_modules/@electron/asar/lib/asar.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createPackage = createPackage;
    exports2.createPackageWithOptions = createPackageWithOptions;
    exports2.createPackageFromFiles = createPackageFromFiles;
    exports2.createPackageFromStreams = createPackageFromStreams;
    exports2.statFile = statFile;
    exports2.getRawHeader = getRawHeader;
    exports2.listPackage = listPackage;
    exports2.extractFile = extractFile;
    exports2.extractAll = extractAll;
    exports2.uncache = uncache;
    exports2.uncacheAll = uncacheAll;
    var path2 = __importStar(require("path"));
    var minimatch_1 = __importDefault(require_minimatch());
    var wrapped_fs_1 = __importDefault(require_wrapped_fs());
    var filesystem_1 = require_filesystem();
    var disk = __importStar(require_disk());
    var crawlfs_1 = require_crawlfs();
    function isUnpackedDir(dirPath, pattern, unpackDirs) {
      if (dirPath.startsWith(pattern) || (0, minimatch_1.default)(dirPath, pattern)) {
        if (!unpackDirs.includes(dirPath)) {
          unpackDirs.push(dirPath);
        }
        return true;
      } else {
        return unpackDirs.some((unpackDir) => dirPath.startsWith(unpackDir) && !path2.relative(unpackDir, dirPath).startsWith(".."));
      }
    }
    async function createPackage(src, dest) {
      return createPackageWithOptions(src, dest, {});
    }
    async function createPackageWithOptions(src, dest, options) {
      const globOptions = options.globOptions ? options.globOptions : {};
      globOptions.dot = options.dot === void 0 ? true : options.dot;
      const pattern = src + (options.pattern ? options.pattern : "/**/*");
      const [filenames, metadata] = await (0, crawlfs_1.crawl)(pattern, globOptions);
      return createPackageFromFiles(src, dest, filenames, metadata, options);
    }
    async function createPackageFromFiles(src, dest, filenames, metadata = {}, options = {}) {
      src = path2.normalize(src);
      dest = path2.normalize(dest);
      filenames = filenames.map(function(filename) {
        return path2.normalize(filename);
      });
      const filesystem = new filesystem_1.Filesystem(src);
      const files = [];
      const links = [];
      const unpackDirs = [];
      let filenamesSorted = [];
      if (options.ordering) {
        const orderingFiles = (await wrapped_fs_1.default.readFile(options.ordering)).toString().split("\n").map((line) => {
          if (line.includes(":")) {
            line = line.split(":").pop();
          }
          line = line.trim();
          if (line.startsWith("/")) {
            line = line.slice(1);
          }
          return line;
        });
        const ordering = [];
        for (const file of orderingFiles) {
          const pathComponents = file.split(path2.sep);
          let str = src;
          for (const pathComponent of pathComponents) {
            str = path2.join(str, pathComponent);
            ordering.push(str);
          }
        }
        let missing = 0;
        const total = filenames.length;
        for (const file of ordering) {
          if (!filenamesSorted.includes(file) && filenames.includes(file)) {
            filenamesSorted.push(file);
          }
        }
        for (const file of filenames) {
          if (!filenamesSorted.includes(file)) {
            filenamesSorted.push(file);
            missing += 1;
          }
        }
        console.log(`Ordering file has ${(total - missing) / total * 100}% coverage.`);
      } else {
        filenamesSorted = filenames;
      }
      const handleFile = async function(filename) {
        if (!metadata[filename]) {
          const fileType = await (0, crawlfs_1.determineFileType)(filename);
          if (!fileType) {
            throw new Error("Unknown file type for file: " + filename);
          }
          metadata[filename] = fileType;
        }
        const file = metadata[filename];
        const shouldUnpackPath = function(relativePath, unpack, unpackDir) {
          let shouldUnpack2 = false;
          if (unpack) {
            shouldUnpack2 = (0, minimatch_1.default)(filename, unpack, { matchBase: true });
          }
          if (!shouldUnpack2 && unpackDir) {
            shouldUnpack2 = isUnpackedDir(relativePath, unpackDir, unpackDirs);
          }
          return shouldUnpack2;
        };
        let shouldUnpack;
        switch (file.type) {
          case "directory":
            shouldUnpack = shouldUnpackPath(path2.relative(src, filename), void 0, options.unpackDir);
            filesystem.insertDirectory(filename, shouldUnpack);
            break;
          case "file":
            shouldUnpack = shouldUnpackPath(path2.relative(src, path2.dirname(filename)), options.unpack, options.unpackDir);
            files.push({ filename, unpack: shouldUnpack });
            return filesystem.insertFile(filename, () => wrapped_fs_1.default.createReadStream(filename), shouldUnpack, file, options);
          case "link":
            shouldUnpack = shouldUnpackPath(path2.relative(src, filename), options.unpack, options.unpackDir);
            links.push({ filename, unpack: shouldUnpack });
            filesystem.insertLink(filename, shouldUnpack);
            break;
        }
        return Promise.resolve();
      };
      const insertsDone = async function() {
        await wrapped_fs_1.default.mkdirp(path2.dirname(dest));
        return disk.writeFilesystem(dest, filesystem, { files, links }, metadata);
      };
      const names = filenamesSorted.slice();
      const next = async function(name) {
        if (!name) {
          return insertsDone();
        }
        await handleFile(name);
        return next(names.shift());
      };
      return next(names.shift());
    }
    async function createPackageFromStreams(dest, streams) {
      const src = ".";
      const filesystem = new filesystem_1.Filesystem(src);
      const files = [];
      const links = [];
      const handleFile = async function(stream) {
        const { path: destinationPath, type } = stream;
        const filename = path2.normalize(destinationPath);
        switch (type) {
          case "directory":
            filesystem.insertDirectory(filename, stream.unpacked);
            break;
          case "file":
            files.push({
              filename,
              streamGenerator: stream.streamGenerator,
              link: void 0,
              mode: stream.stat.mode,
              unpack: stream.unpacked
            });
            return filesystem.insertFile(filename, stream.streamGenerator, stream.unpacked, {
              type: "file",
              stat: stream.stat
            });
          case "link":
            links.push({
              filename,
              streamGenerator: stream.streamGenerator,
              link: stream.symlink,
              mode: stream.stat.mode,
              unpack: stream.unpacked
            });
            filesystem.insertLink(filename, stream.unpacked, path2.dirname(filename), stream.symlink, src);
            break;
        }
        return Promise.resolve();
      };
      const insertsDone = async function() {
        await wrapped_fs_1.default.mkdirp(path2.dirname(dest));
        return disk.streamFilesystem(dest, filesystem, { files, links });
      };
      const streamQueue = streams.slice();
      const next = async function(stream) {
        if (!stream) {
          return insertsDone();
        }
        await handleFile(stream);
        return next(streamQueue.shift());
      };
      return next(streamQueue.shift());
    }
    function statFile(archivePath, filename, followLinks = true) {
      const filesystem = disk.readFilesystemSync(archivePath);
      return filesystem.getFile(filename, followLinks);
    }
    function getRawHeader(archivePath) {
      return disk.readArchiveHeaderSync(archivePath);
    }
    function listPackage(archivePath, options) {
      return disk.readFilesystemSync(archivePath).listFiles(options);
    }
    function extractFile(archivePath, filename, followLinks = true) {
      const filesystem = disk.readFilesystemSync(archivePath);
      const fileInfo = filesystem.getFile(filename, followLinks);
      if ("link" in fileInfo || "files" in fileInfo) {
        throw new Error("Expected to find file at: " + filename + " but found a directory or link");
      }
      return disk.readFileSync(filesystem, filename, fileInfo);
    }
    function extractAll(archivePath, dest) {
      const filesystem = disk.readFilesystemSync(archivePath);
      const filenames = filesystem.listFiles();
      const followLinks = process.platform === "win32";
      wrapped_fs_1.default.mkdirpSync(dest);
      const extractionErrors = [];
      for (const fullPath of filenames) {
        const filename = fullPath.substr(1);
        const destFilename = path2.join(dest, filename);
        const file = filesystem.getFile(filename, followLinks);
        if (path2.relative(dest, destFilename).startsWith("..")) {
          throw new Error(`${fullPath}: file "${destFilename}" writes out of the package`);
        }
        if ("files" in file) {
          wrapped_fs_1.default.mkdirpSync(destFilename);
        } else if ("link" in file) {
          const linkSrcPath = path2.dirname(path2.join(dest, file.link));
          const linkDestPath = path2.dirname(destFilename);
          const relativePath = path2.relative(linkDestPath, linkSrcPath);
          try {
            wrapped_fs_1.default.unlinkSync(destFilename);
          } catch (_a) {
          }
          const linkTo = path2.join(relativePath, path2.basename(file.link));
          if (path2.relative(dest, linkSrcPath).startsWith("..")) {
            throw new Error(`${fullPath}: file "${file.link}" links out of the package to "${linkSrcPath}"`);
          }
          wrapped_fs_1.default.symlinkSync(linkTo, destFilename);
        } else {
          try {
            const content = disk.readFileSync(filesystem, filename, file);
            wrapped_fs_1.default.writeFileSync(destFilename, content);
            if (file.executable) {
              wrapped_fs_1.default.chmodSync(destFilename, "755");
            }
          } catch (e) {
            extractionErrors.push(e);
          }
        }
      }
      if (extractionErrors.length) {
        throw new Error("Unable to extract some files:\n\n" + extractionErrors.map((error) => error.stack).join("\n\n"));
      }
    }
    function uncache(archivePath) {
      return disk.uncacheFilesystem(archivePath);
    }
    function uncacheAll() {
      disk.uncacheAll();
    }
    exports2.default = {
      createPackage,
      createPackageWithOptions,
      createPackageFromFiles,
      createPackageFromStreams,
      statFile,
      getRawHeader,
      listPackage,
      extractFile,
      extractAll,
      uncache,
      uncacheAll
    };
  }
});

// scripts/desktop-sync/patch-app.cjs
var require_patch_app = __commonJS({
  "scripts/desktop-sync/patch-app.cjs"(exports2, module2) {
    "use strict";
    function patchMain2(source) {
      const anchor = "function startCrmBridge(){";
      if (!source.includes(anchor)) throw Error("\u6B64\u5DE5\u4F5C\u53F0\u7248\u672C\u4E0D\u652F\u6301\u73B0\u6709CRM\u8FDE\u63A5\uFF0C\u8BF7\u5148\u63D0\u4F9B\u7248\u672C\u53F7");
      const helper = `let crmAccountSync;
function crmBridgeOwner(){const c=readJson(path.join(app.getPath('userData'),'crm-bridge.json'),{});if(c.accountSync&&(!c.workspace||path.resolve(c.workspace)!==path.resolve(workspaceRoot)))throw Error('\u5DE5\u4F5C\u533A\u4E0ECRM\u8D26\u53F7\u7ED1\u5B9A\u4E0D\u5339\u914D');return c.accountSync?c.localOwner:'Winnie';}
function startCrmAccountSync(){let snapshot,byClient;
 const state=()=>{const data=bootstrapClients(),clients=data.clients,links=readJson(path.join(workbenchDir(),'customer-email-links.json'),{}),mailView=outlookService().view(),owners=new Map();byClient=new Map();
 for(const row of mailView.messages){const ids=new Set();for(const email of row.folder==='inbox'?[row.from]:row.to||[]){const key=customerArchive.normalizeEmail(email);if(!owners.has(key))owners.set(key,customerArchive.emailOwner(key,clients,links));const client=owners.get(key);if(client)ids.add(client.id);}for(const id of ids){if(!byClient.has(id))byClient.set(id,[]);byClient.get(id).push(row);}}
 snapshot={clients,links,mailView};return data;};
 crmAccountSync=require('./crm-account-sync').createAccountSync({configFile:path.join(app.getPath('userData'),'crm-bridge.json'),request:(...a)=>net.fetch(...a),root:()=>workspaceRoot,state,save:saveClients,profile:require('./crm-client-management').profile,archive:c=>saveCustomerArchive(c,true,{...snapshot,mailRows:byClient.get(c.id)||[]}).messages,scenes:()=>receptionConfig().scenes,changed:value=>sendWhatsAppEvent('crm:synced',value)});crmAccountSync.start();}
`;
      if (source.includes("createAccountSync")) {
        const begin = source.indexOf("function startCrmAccountSync(){"), end2 = source.indexOf("\nfunction startCrmBridge()", begin);
        if (begin < 0 || end2 < 0) throw Error("\u5DF2\u6709\u540C\u6B65\u7EC4\u4EF6\u65E0\u6CD5\u5B89\u5168\u66F4\u65B0");
        const replacement = helper.slice(helper.indexOf("function startCrmAccountSync(){"));
        return source.slice(0, begin) + replacement + source.slice(end2 + 1);
      }
      source = source.replace(anchor, helper + anchor);
      source = source.replaceAll("owner: 'Winnie'", "owner: crmBridgeOwner()").replaceAll("owner:'Winnie'", "owner:crmBridgeOwner()");
      const start = source.indexOf("let crmBridge,crmLastMailSync=0;"), end = source.indexOf("app.on('before-quit'", start);
      if (start < 0 || end < 0) throw Error("CRM\u7EC4\u4EF6\u4F4D\u7F6E\u65E0\u6CD5\u9A8C\u8BC1\uFF0C\u672A\u4FEE\u6539");
      let bridge = source.slice(start, end);
      bridge = bridge.replaceAll(".toLowerCase()!=='winnie'", ".toLowerCase()!==crmBridgeOwner().toLowerCase()").replaceAll(".toLowerCase()==='winnie'", ".toLowerCase()===crmBridgeOwner().toLowerCase()").replaceAll("owner:'Winnie'", "owner:crmBridgeOwner()").replace("management.update(state,changes)", "management.update(state,changes,crmBridgeOwner())").replace("crmBridge.start();", "crmBridge.start();startCrmAccountSync();").replace("reception:receptionConfig().enabled}),execute", "reception:receptionConfig().enabled,error:crmAccountSync?.error()||''}),execute");
      source = source.slice(0, start) + bridge + source.slice(end);
      source = source.replace("speaker:m.speaker,text:String(m.text||'').slice(0,2000)", "speaker:m.speaker,outgoing:/^(?:winnie(?:[ ]+wu)?(?:[ ]*[(]Email[)])?|\u6211\u65B9|me)$/i.test(m.speaker||''),text:String(m.text||'').slice(0,2000)");
      source = source.replace("crmBridge?.stop();", "crmBridge?.stop();crmAccountSync?.stop();");
      return source;
    }
    function patchManagement2(source) {
      if (source.includes("function update(state,changes,owner='Winnie')")) return source;
      if (!source.includes("function update(state,changes)")) throw Error("\u5BA2\u6237\u7F16\u8F91\u7EC4\u4EF6\u7248\u672C\u4E0D\u517C\u5BB9");
      return source.replace("function update(state,changes)", "function update(state,changes,owner='Winnie')").replace("String(c.owner).toLowerCase()==='winnie'", "String(c.owner).toLowerCase()===owner.toLowerCase()");
    }
    function patchBridge2(source) {
      if (source.includes("u.origin!=='https://yifun-crm.yifunlife.workers.dev'")) return source;
      return source.replace("u.origin!=='https://yifun-life-crm.enquiry150941.chatgpt.site'&&", "u.origin!=='https://yifun-crm.yifunlife.workers.dev'&&u.origin!=='https://yifun-life-crm.enquiry150941.chatgpt.site'&&");
    }
    function patchRenderer2(source) {
      const prior = "const grades=['VIP','A','B','C','D','Yifun Staff'];", next = "const grades=['VIP','A','B','C','D','Yifun Staff','\u672A\u5206\u7C7B'];";
      if (!source.includes(next)) {
        if (!source.includes(prior) || !source.includes("list.filter(c=>c.grade===grade)")) throw Error("\u5BA2\u6237\u5206\u7EC4\u7EC4\u4EF6\u7248\u672C\u4E0D\u517C\u5BB9");
        source = source.replace(prior, next).replace("list.filter(c=>c.grade===grade)", "list.filter(c=>(c.grade||'\u672A\u5206\u7C7B')===grade)").replace("new Set(['VIP','A','B','C','whatsapp-groups'])", "new Set(['VIP','A','B','C','whatsapp-groups','\u672A\u5206\u7C7B'])");
      }
      return source.includes("crm-connection-renderer.js") ? source : source + "\n(()=>{const script=document.createElement('script');script.src='../crm-connection-renderer.js';document.head.appendChild(script)})();\n";
    }
    function patchConnectionPreload2(source) {
      return source.includes("exposeInMainWorld('crmConnection'") ? source : source + "\ncontextBridge.exposeInMainWorld('crmConnection',{get:()=>ipcRenderer.invoke('crm:connection-get'),test:payload=>ipcRenderer.invoke('crm:connection-test',payload),save:payload=>ipcRenderer.invoke('crm:connection-save',payload)});\n";
    }
    function patchConnectionMain2(source) {
      const create = source.indexOf("ipcMain.handle('clients:create'");
      if (create >= 0) {
        const end = source.indexOf("\n", create), part = source.slice(create, end < 0 ? source.length : end);
        source = source.replace(part, part.replace("owner:'Winnie'", "owner:crmBridgeOwner()"));
      }
      source = source.replace("owner:'Winnie',lostReason:'',notes:'\u56FD\u5BB6\u3001\u9879\u76EE\u53CA\u5BA2\u6237\u7B49\u7EA7\u8BF7\u4EBA\u5DE5\u786E\u8BA4\u3002'", "owner:crmBridgeOwner(),lostReason:'',notes:'\u56FD\u5BB6\u3001\u9879\u76EE\u53CA\u5BA2\u6237\u7B49\u7EA7\u8BF7\u4EBA\u5DE5\u786E\u8BA4\u3002'");
      source = source.replace("require('./crm-connection-settings')", "require('./crm-connection-settings.cjs')");
      if (source.includes("require('./crm-connection-settings.cjs')")) return source;
      return source + `
const crmConnectionSettings=require('./crm-connection-settings.cjs').createConnectionSettings({configFile:path.join(app.getPath('userData'),'crm-bridge.json'),root:()=>workspaceRoot,clients:()=>bootstrapClients().clients,request:(...args)=>net.fetch(...args),pause:async()=>{if(crmAccountSync?.stopAndWait)await crmAccountSync.stopAndWait();else crmAccountSync?.stop();},start:()=>{if(!crmBridge)startCrmBridge();else startCrmAccountSync();}});
ipcMain.handle('crm:connection-get',()=>crmConnectionSettings.get());
ipcMain.handle('crm:connection-test',(_,payload)=>crmConnectionSettings.test(payload||{}));
ipcMain.handle('crm:connection-save',(_,payload)=>crmConnectionSettings.save(payload||{}));
`;
    }
    function patchFirstContactMain2(source) {
      source = source.replace("material:()=>reception.approvedFile(receptionConfig(),'company'),guard:", "material:()=>{const value=receptionConfig(root);return reception.approvedFile({...value,files:{...value.files,company:'(Compressed)Yifunlife Company Profile.pdf'}},'company')},guard:");
      if (source.includes("require('./crm-first-contact')")) return source;
      const anchor = " const management=require('./crm-client-management');";
      if (!source.includes(anchor)) throw Error("\u6B64\u5DE5\u4F5C\u53F0\u7248\u672C\u4E0D\u652F\u6301\u81EA\u52A8\u9996\u8054\uFF0C\u672A\u4FEE\u6539");
      source = source.replace(anchor, anchor + `
 if(p.auto_first_contact){
  const config=readJson(path.join(app.getPath('userData'),'crm-bridge.json'),{});
  const mailSender=createOutlookOutreach({read:(name,fallback)=>readJson(path.join(root,'.workbench',name),fallback),write:(name,value)=>writeJson(path.join(root,'.workbench',name),value),token:()=>backgroundOutlookToken(true),fetch:(...args)=>net.fetch(...args),material:()=>{const value=receptionConfig(root);return reception.approvedFile({...value,files:{...value.files,company:'(Compressed)Yifunlife Company Profile.pdf'}},'company')},guard:()=>root===workspaceRoot&&!app.isQuitting});
  return require('./crm-first-contact').firstContact({phonePolicy:require('./outreach-policy'),command,config,getClient,clients:()=>bootstrapClients().clients,read:(name,fallback)=>readJson(path.join(root,'.workbench',name),fallback),draft:loadDraft,archive:client=>saveCustomerArchive(client).messages,active:()=>root===workspaceRoot&&!app.isQuitting,
   whatsappHistory:async phone=>{const jid=phone+'@s.whatsapp.net',names=whatsappContactNames(),aliases=[jid,...(names.aliases.get(jid)||[])].filter(value=>/^\\d+@(s\\.whatsapp\\.net|lid)$/.test(value));return (await readWhatsAppDatabase("SELECT id FROM messages WHERE is_from_me=1 AND chat_jid IN ("+aliases.map(value=>"'"+value+"'").join(',')+") LIMIT 1")).length>0;},
   normalizePhone:(clientId,phone)=>{const state=bootstrapClients(),client=state.clients.find(c=>c.id===clientId);client.whatsapp=phone;saveClients(state);},
   sendWhatsApp:(client,text,guard)=>sendReception(client.id,{kind:'lead-welcome',text},{manual:true,requestId:command.id,guard}),sendEmail:(client,check)=>mailSender.send(client,'first',check)});
 }

`);
      const status = "reception:receptionConfig().enabled,error:crmAccountSync?.error()";
      if (!source.includes(status)) throw Error("\u5DE5\u4F5C\u53F0\u72B6\u6001\u4E0A\u62A5\u7248\u672C\u4E0D\u517C\u5BB9\uFF0C\u672A\u4FEE\u6539");
      return source.replace(status, "reception:receptionConfig().enabled,autoFirstContact:!!readJson(path.join(app.getPath('userData'),'crm-bridge.json'),{}).autoFirstContact,error:crmAccountSync?.error()");
    }
    module2.exports = { patchFirstContactMain: patchFirstContactMain2, patchMain: patchMain2, patchManagement: patchManagement2, patchBridge: patchBridge2, patchRenderer: patchRenderer2, patchConnectionPreload: patchConnectionPreload2, patchConnectionMain: patchConnectionMain2 };
  }
});

// scripts/desktop-sync/setup.cjs
process.noAsar = true;
var fs = require("node:fs");
var path = require("node:path");
var os = require("node:os");
var cp = require("node:child_process");
var crypto = require("node:crypto");
var asar = require_asar();
var { patchFirstContactMain, patchMain, patchManagement, patchBridge, patchRenderer, patchConnectionMain, patchConnectionPreload } = require_patch_app();
var run = (bin, args) => cp.execFileSync(bin, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
var dialog = (script) => run("/usr/bin/osascript", ["-e", script]).trim();
var digest = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
function header(file) {
  const fd = fs.openSync(file, "r"), pre = Buffer.alloc(16);
  fs.readSync(fd, pre, 0, 16, 0);
  const bytes = Buffer.alloc(pre.readUInt32LE(12));
  fs.readSync(fd, bytes, 0, bytes.length, 16);
  fs.closeSync(fd);
  return { tree: JSON.parse(bytes), hash: digest(bytes) };
}
function entries(tree, base = "") {
  return Object.entries(tree.files || {}).flatMap(([name, value]) => value.files ? entries(value, base + name + "/") : [{ name: base + name, ...value }]);
}
function closed(app) {
  const found = cp.spawnSync("/usr/bin/pgrep", ["-f", app + "/Contents/MacOS/"], { encoding: "utf8" });
  if (found.status !== 1 && found.stdout.trim().split(/\s+/).some((pid) => Number(pid) !== process.pid)) throw Error("\u8BF7\u4FDD\u5B58\u8D44\u6599\u5E76\u5B8C\u5168\u9000\u51FA\u4EA6\u73A9\u9500\u552E\u5DE5\u4F5C\u53F0\uFF0C\u518D\u91CD\u65B0\u53CC\u51FB\u5B89\u88C5\u3002");
}
async function prepare(app, output) {
  const archive = app + "/Contents/Resources/app.asar", before = header(archive), info = app + "/Contents/Info.plist";
  const signature = cp.spawnSync("/usr/bin/codesign", ["-dv", "--verbose=4", app], { encoding: "utf8" });
  if (signature.status || !signature.stderr.includes("Signature=adhoc")) throw Error("\u6B64\u5B89\u88C5\u5305\u4EC5\u652F\u6301\u73B0\u6709\u516C\u53F8\u4E34\u65F6\u7B7E\u540D\u7248\u672C\uFF1B\u5F53\u524D\u7248\u672C\u9700\u53E6\u884C\u63D0\u4F9B\u5BF9\u5E94\u6B63\u5F0F\u66F4\u65B0\uFF0C\u672A\u4FEE\u6539\u5E94\u7528\u3002");
  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
  const stored = run("/usr/libexec/PlistBuddy", ["-c", "Print :ElectronAsarIntegrity:Resources/app.asar:hash", info]).trim();
  if (stored !== before.hash) throw Error("\u539F\u5E94\u7528\u5B8C\u6574\u6027\u68C0\u67E5\u672A\u901A\u8FC7\uFF0C\u672A\u4FEE\u6539");
  const folder = path.join(output, "source"), candidate = path.join(output, "\u4EA6\u73A9\u9500\u552E\u5DE5\u4F5C\u53F0.app");
  asar.extractAll(archive, folder);
  run("/usr/bin/ditto", [app, candidate]);
  for (const [name, patch] of [["main.js", (source) => patchFirstContactMain(patchConnectionMain(patchMain(source)))], ["preload.js", patchConnectionPreload], ["crm-client-management.js", patchManagement], ["crm-bridge.js", patchBridge], ["renderer/renderer.js", patchRenderer]]) {
    const file = path.join(folder, name);
    fs.writeFileSync(file, patch(fs.readFileSync(file, "utf8")));
  }
  fs.copyFileSync(path.join(__dirname, "crm-account-sync.cjs"), path.join(folder, "crm-account-sync.js"));
  fs.copyFileSync(path.join(__dirname, "crm-history-sync.cjs"), path.join(folder, "crm-history-sync.cjs"));
  fs.copyFileSync(path.join(__dirname, "crm-first-contact.cjs"), path.join(folder, "crm-first-contact.js"));
  for (const [file, name] of [["crm-connection-settings.cjs", "crm-connection-settings.cjs"], ["crm-connection-renderer.js", "crm-connection-renderer.js"]]) fs.copyFileSync(path.join(__dirname, file), path.join(folder, name));
  for (const name of ["crm-first-contact.js", "main.js", "crm-client-management.js", "crm-bridge.js", "crm-account-sync.js", "crm-history-sync.cjs", "renderer/renderer.js", "preload.js", "crm-connection-settings.cjs", "crm-connection-renderer.js"]) {
    const script = fs.readFileSync(path.join(folder, name), "utf8");
    new (require("node:vm")).Script(script, { filename: name });
  }
  const files = entries(before.tree), unpacked = files.filter((f) => f.unpacked).map((f) => path.join(folder, f.name));
  await asar.createPackageWithOptions(folder, candidate + "/Contents/Resources/app.asar", unpacked.length ? { unpack: unpacked.length === 1 ? unpacked[0] : "{" + unpacked.join(",") + "}" } : {});
  const next = candidate + "/Contents/Resources/app.asar", after = header(next), allowed = ["crm-first-contact.js", "main.js", "crm-client-management.js", "crm-bridge.js", "crm-account-sync.js", "crm-history-sync.cjs", "renderer/renderer.js", "preload.js", "crm-connection-settings.cjs", "crm-connection-renderer.js"];
  for (const file of files) {
    if (file.link) continue;
    const original = asar.extractFile(archive, file.name), updated = asar.extractFile(next, file.name);
    if (!allowed.includes(file.name) && digest(original) !== digest(updated)) throw Error("\u65E0\u5173\u5E94\u7528\u6587\u4EF6\u53D1\u751F\u53D8\u5316\uFF0C\u672A\u5B89\u88C5\uFF1A" + file.name);
  }
  for (const file of entries(after.tree)) {
    if (!files.some((f) => f.name === file.name) && !["crm-first-contact.js", "crm-account-sync.js", "crm-history-sync.cjs", "renderer/renderer.js", "preload.js", "crm-connection-settings.cjs", "crm-connection-renderer.js"].includes(file.name)) throw Error("\u66F4\u65B0\u5305\u542B\u672A\u77E5\u6587\u4EF6\uFF0C\u672A\u5B89\u88C5");
  }
  run("/usr/libexec/PlistBuddy", ["-c", "Set :ElectronAsarIntegrity:Resources/app.asar:hash " + after.hash, candidate + "/Contents/Info.plist"]);
  const ent = run("/usr/bin/codesign", ["-d", "--entitlements", ":-", app]);
  if (!ent.includes("<plist")) throw Error("\u65E0\u6CD5\u6838\u5BF9\u539F\u5E94\u7528\u6743\u9650\uFF0C\u672A\u5B89\u88C5");
  const entitlement = path.join(output, "entitlements.plist");
  fs.writeFileSync(entitlement, ent);
  run("/usr/bin/codesign", ["--force", "--sign", "-", "--options", "runtime", "--entitlements", entitlement, candidate]);
  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", candidate]);
  return { candidate, verifiedFiles: files.length, changedSource: allowed, originalHash: before.hash, updatedHash: after.hash };
}
async function install() {
  const test = process.argv.indexOf("--verify-app");
  if (test >= 0) {
    const output2 = fs.mkdtempSync(path.join(os.tmpdir(), "yifun-crm-verify-"));
    console.log(JSON.stringify(await prepare(process.argv[test + 1], output2)));
    return;
  }
  if (process.argv.includes("--add-connection-ui")) {
    const app2 = "/Applications/\u4EA6\u73A9\u9500\u552E\u5DE5\u4F5C\u53F0.app";
    closed(app2);
    const dir2 = path.join(os.homedir(), "Library", "Application Support", "\u4EA6\u73A9\u9500\u552E\u5DE5\u4F5C\u53F0"), settings2 = fs.existsSync(path.join(dir2, "settings.json")) ? JSON.parse(fs.readFileSync(path.join(dir2, "settings.json"), "utf8")) : {}, workspace2 = settings2.workspace || path.join(os.homedir(), "Documents", "Yifun Sales Workbench V1");
    const backup2 = fs.mkdtempSync(path.join(os.homedir(), "Documents", "CRM\u8FDE\u63A5\u529F\u80FD\u5347\u7EA7\u5907\u4EFD-")), output2 = fs.mkdtempSync(path.join(path.dirname(app2), ".crm-connector-update-")), hashes = {};
    for (const file of [path.join(dir2, "crm-bridge.json"), path.join(dir2, "settings.json"), ...["crm.json", "crm-account-sync.json", "drafts.json"].map((name) => path.join(workspace2, ".workbench", name))]) if (fs.existsSync(file)) {
      hashes[file] = digest(fs.readFileSync(file));
      fs.copyFileSync(file, path.join(backup2, path.basename(file)));
      fs.chmodSync(path.join(backup2, path.basename(file)), 384);
    }
    const result2 = await prepare(app2, output2);
    closed(app2);
    for (const [file, hash] of Object.entries(hashes)) if (digest(fs.readFileSync(file)) !== hash) throw Error("\u5347\u7EA7\u671F\u95F4\u8D44\u6599\u53D1\u751F\u53D8\u5316\uFF0C\u672A\u8986\u76D6\u5E94\u7528");
    const previous = path.join(backup2, "previous-installed.app");
    fs.renameSync(app2, previous);
    try {
      fs.renameSync(result2.candidate, app2);
      run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app2]);
    } catch (error) {
      if (fs.existsSync(app2)) fs.renameSync(app2, path.join(output2, "failed.app"));
      fs.renameSync(previous, app2);
      throw error;
    }
    fs.writeFileSync(path.join(backup2, "verification.json"), JSON.stringify({ ...result2, businessFilesUnchanged: true }, null, 2), { mode: 384 });
    run("/usr/bin/open", [app2]);
    dialog('display dialog "\u8FDE\u63A5\u529F\u80FD\u5DF2\u5347\u7EA7\u3002\u8BF7\u6253\u5F00\u5DE5\u4F5C\u53F0\u53F3\u4E0A\u89D2\u7684CRM\u8FDE\u63A5\uFF0C\u586B\u5199CRM\u5730\u5740\u548C\u672C\u4EBA\u8FDE\u63A5\u7801\u3002\u539F\u8D44\u6599\u548C\u539F\u8FDE\u63A5\u914D\u7F6E\u4FDD\u7559\u3002" buttons {"\u5B8C\u6210"} default button "\u5B8C\u6210"');
    return;
  }
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "account.json"), "utf8"));
  if (!/^[a-f0-9-]{36}$/.test(config.owner_id || "") || typeof config.username !== "string" || !config.username || !/^https:\/\//.test(config.origin || "") || !(/^[a-f0-9]{96}$/.test(config.token || "") || /^[a-f0-9-]{64,80}$/.test(config.token || ""))) throw Error("\u8FDE\u63A5\u5305\u8D26\u53F7\u6838\u5BF9\u5931\u8D25\uFF0C\u8BF7\u4ECE\u672C\u4EBACRM\u8D26\u53F7\u91CD\u65B0\u4E0B\u8F7D");
  dialog("display dialog " + JSON.stringify("\u8FDE\u63A5\u5F53\u524DCRM\u8D26\u53F7\uFF1A" + config.name + " / " + config.username + "\u3002\u8BF7\u5148\u4FDD\u5B58\u5E76\u9000\u51FA\u539F\u5DE5\u4F5C\u53F0\uFF0C\u4EC5\u5728\u672C\u4EBAMac\u4F7F\u7528\u3002") + ' buttons {"\u53D6\u6D88", "\u7EE7\u7EED\u5B89\u88C5"} default button "\u7EE7\u7EED\u5B89\u88C5" cancel button "\u53D6\u6D88"');
  const app = "/Applications/\u4EA6\u73A9\u9500\u552E\u5DE5\u4F5C\u53F0.app";
  closed(app);
  const dir = path.join(os.homedir(), "Library", "Application Support", "\u4EA6\u73A9\u9500\u552E\u5DE5\u4F5C\u53F0"), configFile = path.join(dir, "crm-bridge.json"), settingsFile = path.join(dir, "settings.json");
  const settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, "utf8")) : {};
  const existing = settings.workspace || path.join(os.homedir(), "Documents", "Yifun Sales Workbench V1"), start = fs.existsSync(existing) ? existing : path.join(os.homedir(), "Documents");
  const workspace = dialog('POSIX path of (choose folder with prompt "\u9009\u62E9\u539F\u6765\u7684\u5DE5\u4F5C\u53F0\u8D44\u6599\u6587\u4EF6\u5939\uFF1B\u4E0D\u8981\u65B0\u5EFA\u6587\u4EF6\u5939" default location POSIX file ' + JSON.stringify(start) + ")").replace(/\/$/, "");
  const crm = path.join(workspace, ".workbench", "crm.json");
  if (!fs.existsSync(path.join(workspace, "knowledge", "04_\u5BA2\u6237\u804A\u5929")) || !fs.existsSync(crm)) throw Error("\u6240\u9009\u6587\u4EF6\u5939\u6CA1\u6709\u73B0\u6709\u5BA2\u6237\u8D44\u6599\uFF1B\u672A\u5EFA\u7ACB\u7A7A\u5DE5\u4F5C\u533A\uFF0C\u4E5F\u672A\u4FEE\u6539\u5E94\u7528");
  const original = fs.readFileSync(crm), data = JSON.parse(original);
  if (!Array.isArray(data.clients)) throw Error("\u5BA2\u6237\u8D44\u6599\u683C\u5F0F\u4E0D\u7B26\u5408\u539F\u5DE5\u4F5C\u53F0");
  const labels = [...new Set(data.clients.filter((c) => !c.deleted && !c.group).map((c) => String(c.owner || "")))];
  if (labels.some((x) => !x)) throw Error("\u539F\u8D44\u6599\u7684\u5BA2\u6237\u5F52\u5C5E\u4E0D\u5B8C\u6574\uFF0C\u9700\u5148\u6838\u5BF9");
  let localOwner = labels[0] || config.name || config.username;
  if (labels.length > 1) {
    const list = labels.map((x) => JSON.stringify(x)).join(",");
    localOwner = dialog("set picked to choose from list {" + list + '} with prompt "\u9009\u62E9\u6B64\u8D44\u6599\u5E93\u91CC\u5C5E\u4E8E\u672C\u4EBA\u7684\u539F\u6709\u8D1F\u8D23\u4EBA\u6807\u7B7E\uFF08\u4FDD\u6301\u539F\u6807\u7B7E\uFF0C\u4E0D\u6539\u5BA2\u6237\u5F52\u5C5E\uFF09"\nif picked is false then error number -128\nreturn item 1 of picked');
  }
  const old = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, "utf8")) : {};
  if (old.owner_id && old.owner_id !== config.owner_id) throw Error("\u6B64Mac\u5DF2\u7ED1\u5B9A\u53E6\u4E00CRM\u8D26\u53F7\uFF0C\u672A\u8986\u76D6\u539F\u8FDE\u63A5");
  if (old.token && old.token !== config.token && !(old.owner_id === config.owner_id && config.replace_existing === true)) throw Error("\u6B64Mac\u5DF2\u6709\u8FDE\u63A5\uFF0C\u8BF7\u5148\u5728\u672C\u4EBACRM\u6838\u5BF9\u5E76\u66F4\u6362\u914D\u7F6E");
  const journalFile = path.join(workspace, ".workbench", "crm-account-sync.json");
  if (fs.existsSync(journalFile) && JSON.parse(fs.readFileSync(journalFile, "utf8")).owner_id !== config.owner_id) throw Error("\u5DE5\u4F5C\u533A\u5DF2\u7ED1\u5B9A\u5176\u4ED6CRM\u8D26\u53F7\uFF0C\u672A\u4FEE\u6539");
  const before = fs.mkdtempSync(path.join(os.homedir(), "Documents", "CRM\u5DE5\u4F5C\u53F0\u8FDE\u63A5\u5907\u4EFD-")), output = fs.mkdtempSync(path.join(path.dirname(app), ".crm-connector-update-"));
  fs.writeFileSync(path.join(before, "crm.json"), original, { mode: 384 });
  if (fs.existsSync(configFile)) fs.copyFileSync(configFile, path.join(before, "crm-bridge.json"));
  if (fs.existsSync(settingsFile)) fs.copyFileSync(settingsFile, path.join(before, "settings.json"));
  const result = await prepare(app, output);
  closed(app);
  if (digest(fs.readFileSync(crm)) !== digest(original)) throw Error("\u5B89\u88C5\u671F\u95F4\u5BA2\u6237\u8D44\u6599\u53D1\u751F\u53D8\u5316\uFF0C\u672A\u8986\u76D6\u5E94\u7528\uFF0C\u8BF7\u91CD\u65B0\u5B89\u88C5");
  const backup = path.join(before, "previous-installed.app");
  fs.renameSync(app, backup);
  try {
    fs.renameSync(result.candidate, app);
    run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify({ ...config, ...old.owner_id === config.owner_id && old.autoFirstContact ? { autoFirstContact: old.autoFirstContact } : {}, enabled: true, accountSync: true, fullHistory: true, historyOnly: false, pullOnly: true, uploadNewLeads: true, workspace, localOwner }, null, 2), { mode: 384 });
    fs.chmodSync(configFile, 384);
    fs.writeFileSync(settingsFile, JSON.stringify({ ...settings, workspace }, null, 2), { mode: 384 });
  } catch (e) {
    if (fs.existsSync(app)) fs.renameSync(app, path.join(output, "failed.app"));
    fs.renameSync(backup, app);
    if (fs.existsSync(path.join(before, "crm-bridge.json"))) fs.copyFileSync(path.join(before, "crm-bridge.json"), configFile);
    else if (fs.existsSync(configFile)) fs.unlinkSync(configFile);
    if (fs.existsSync(path.join(before, "settings.json"))) fs.copyFileSync(path.join(before, "settings.json"), settingsFile);
    else if (fs.existsSync(settingsFile)) fs.unlinkSync(settingsFile);
    throw e;
  }
  fs.writeFileSync(path.join(before, "verification.json"), JSON.stringify({ ...result, workspace, owner_id: config.owner_id, customerFileUnchanged: digest(fs.readFileSync(crm)) === digest(original) }, null, 2), { mode: 384 });
  run("/usr/bin/open", [app]);
  dialog('display dialog "\u5B89\u88C5\u5B8C\u6210\u3002\u8BF7\u4FDD\u6301\u5DE5\u4F5C\u53F0\u6253\u5F00\u548C\u8054\u7F51\uFF0C\u5728CRM\u5207\u6362\u5230\u6211\u7684\u4E1A\u52A1 \u2192 \u5BA2\u6237\u6C9F\u901A\u3002\u9996\u6B21\u5168\u6587\u5BFC\u5165\u6309\u8BB0\u5F55\u91CF\u5206\u6279\u8FDB\u884C\uFF0C\u53EF\u5728\u5BA2\u6237\u6863\u6848\u67E5\u770B\u540C\u6B65\u8FDB\u5EA6\uFF1B\u672A\u5B8C\u6210\u524D\u8BF7\u4FDD\u6301\u5DE5\u4F5C\u53F0\u8FD0\u884C\u3002\u4E24\u7AEF\u540C\u65F6\u4FEE\u6539\u7684\u5B57\u6BB5\u4F1A\u4FDD\u7559\u5E76\u63D0\u793A\u6838\u5BF9\u3002\u65E7\u5E94\u7528\u548C\u8D44\u6599\u5DF2\u5907\u4EFD\u5230 Documents\u3002" buttons {"\u5B8C\u6210"} default button "\u5B8C\u6210"');
  console.log("\u672C\u4EBA\u5DE5\u4F5C\u53F0\u8FDE\u63A5\u5DF2\u5B89\u88C5\u3002\u5907\u4EFD\uFF1A" + before);
}
install().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
