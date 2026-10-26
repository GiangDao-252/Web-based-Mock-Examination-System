(function () {
    "use strict";
    function question(text, a, b, c, d, correctAnswer) {
        return { text: text, options: { a: a, b: b, c: c, d: d }, correctAnswer: correctAnswer };
    }
    window.sampleExams = [
        {
            id: "sample-math", title: "Toán học — Khởi động", durationMinutes: 15, subject: "Toán học", description: "Ôn số học, phương trình và hình học cơ bản.",
            questions: [
                question("Giá trị của 2 + 3 × 4 là bao nhiêu?", "20", "14", "24", "9", "b"),
                question("Nghiệm của phương trình 2x + 6 = 14 là gì?", "2", "3", "4", "5", "c"),
                question("Diện tích hình chữ nhật dài 8 cm, rộng 5 cm là bao nhiêu?", "13 cm²", "26 cm²", "40 cm²", "80 cm²", "c"),
                question("25% của 200 bằng bao nhiêu?", "25", "50", "75", "100", "b"),
                question("Trung bình cộng của 4, 6 và 8 bằng bao nhiêu?", "5", "6", "7", "8", "b")
            ]
        },
        {
            id: "sample-computing", title: "Tin học — Kiến thức nền tảng", durationMinutes: 10, subject: "Tin học", description: "Làm quen với dữ liệu, lập trình và kiến thức web.",
            questions: [
                question("Một byte thường gồm bao nhiêu bit?", "2", "4", "8", "16", "c"),
                question("HTML được dùng chủ yếu để làm gì?", "Mô tả cấu trúc trang web", "Quản lý bộ nhớ RAM", "Mã hóa ổ đĩa", "Biên dịch Java", "a"),
                question("Trong Python, len([1, 2, 3]) trả về giá trị nào?", "1", "2", "3", "4", "c"),
                question("SQL SELECT được dùng để làm gì?", "Xóa một bảng", "Truy vấn dữ liệu", "Định dạng văn bản", "Tắt máy chủ", "b"),
                question("CSS chủ yếu dùng để làm gì?", "Lưu mật khẩu", "Thiết lập kiểu hiển thị trang web", "Chia địa chỉ IP", "Quản lý tiến trình", "b")
            ]
        },
        {
            id: "sample-english", title: "Tiếng Anh — Everyday English", durationMinutes: 10, subject: "Tiếng Anh", description: "Luyện từ vựng và ngữ pháp tiếng Anh cơ bản.",
            questions: [
                question("Choose the correct sentence.", "She go to school every day.", "She goes to school every day.", "She going to school every day.", "She gone to school every day.", "b"),
                question("What is the plural of 'child'?", "Childs", "Childes", "Children", "Childrens", "c"),
                question("Complete: I have lived here ___ 2020.", "for", "since", "at", "on", "b"),
                question("Choose the opposite of 'expensive'.", "Cheap", "Large", "Fast", "Heavy", "a"),
                question("Complete: If it rains, we ___ stay at home.", "will", "would", "did", "have", "a")
            ]
        }
    ];
})();
