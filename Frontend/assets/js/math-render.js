(function () {
    "use strict";
    let queue = Promise.resolve();
    window.MatchdayMath = {
        render(root) {
            if (!root) return Promise.resolve();
            queue = queue.then(async function () {
                if (!window.MathJax) return;
                await window.MathJax.startup.promise;
                if (!window.MathJax.typesetPromise) throw new Error("MathJax chưa sẵn sàng");
                window.MathJax.typesetClear([root]);
                await window.MathJax.typesetPromise([root]);
                const notice = document.querySelector("#math-status");
                if (notice) notice.textContent = root.querySelector('[data-mml-node="merror"], mjx-merror') ? "Có công thức sai cú pháp. Hãy kiểm tra phần công thức được đánh dấu." : "";
            }).catch(function () {
                const notice = document.querySelector("#math-status");
                if (notice) notice.textContent = "Một số công thức chưa hiển thị được. Hãy kiểm tra cú pháp LaTeX.";
            });
            return queue;
        },
        clear(root) { if (window.MathJax && window.MathJax.typesetClear) window.MathJax.typesetClear([root]); }
    };
    window.MathJax = {
        loader: {load: ["ui/safe"]},
        tex: {inlineMath: [["\\(", "\\)"]], displayMath: [["\\[", "\\]"]], maxBuffer: 20000},
        options: {enableMenu: false, safeOptions: {allow: {URLs: "none", classes: "none", cssIDs: "none", styles: "none"}}},
        startup: {typeset: false, ready() { window.MathJax.startup.defaultReady(); }}
    };
})();
