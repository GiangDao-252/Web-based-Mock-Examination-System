import re
import subprocess
import unicodedata
from collections import Counter
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import BadZipFile, ZipFile

from docx import Document
from docx.table import Table
from pypdf import PdfReader


MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
MAX_TEXT_LENGTH = 300_000
MAX_PDF_PAGES = 30
MAX_OCR_PAGES = 5
MAX_QUESTIONS = 100

MISSING_ANSWER = "Chưa có đáp án đúng; cần chọn trước khi lưu."

QUESTION = re.compile(
    r"^\s*(?:Câu|Cau|Question)\s+(\d+)\s*[.:)]\s*(.*)$",
    re.IGNORECASE,
)
OPTION = re.compile(r"^\s*([A-D])\s*[.)]\s*(.*)$")
ANSWER = re.compile(
    r"^\s*(?:Đáp án(?: đúng)?|Dap an(?: dung)?|Answer)"
    r"\s*:\s*([A-D])\s*[.]?\s*$",
    re.IGNORECASE,
)
EXPLANATION = re.compile(
    r"^\s*(?:Lời giải|Giải thích|Explanation)\s*:\s*(.*)$",
    re.IGNORECASE,
)
UNSUPPORTED_SECTION = re.compile(
    r"^\s*PHẦN\s+(?:[IVX]+|\d+).*"
    r"(?:đúng\s*[/–-]?\s*sai|trả lời ngắn|tự luận)",
    re.IGNORECASE,
)

OCR_OPTION = re.compile(r"(?<!\S)([A-D])(?:\1)?[.)]\s*", re.IGNORECASE)
KEY_HEADING = re.compile(
    r"^(?:(?:bang\s+)?dap\s+an(?:\s+(?:tham\s+khao|dung))?"
    r"|answer\s+key)(?:\s*:\s*(.*))?$"
)
KEY_PAIR = r"(\d{1,3})\s*[.:)\-–]\s*([a-d])"
KEY_ROW = re.compile(rf"{KEY_PAIR}(?:[\s,;|]+{KEY_PAIR})*[\s,;|]*")
KEY_ENTRY = re.compile(KEY_PAIR)


class DocumentImportError(ValueError):
    pass


def fold_text(text):
    return "".join(
        char
        for char in unicodedata.normalize("NFD", text.casefold())
        if not unicodedata.combining(char)
    ).replace("đ", "d").strip()


def run_ocr_command(command, timeout):
    try:
        return subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=True,
            timeout=timeout,
        ).stdout
    except FileNotFoundError:
        raise DocumentImportError(
            "Máy chạy backend chưa cài Poppler hoặc Tesseract."
        ) from None
    except subprocess.TimeoutExpired:
        raise DocumentImportError(
            "Nhận dạng PDF mất quá nhiều thời gian. Hãy thử file ngắn hơn."
        ) from None
    except subprocess.CalledProcessError:
        raise DocumentImportError(
            "Không nhận dạng được PDF scan. Kiểm tra file "
            "và bộ ngôn ngữ vie, eng của Tesseract."
        ) from None


def normalize_ocr_text(text):
    lines = []

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue

        # OCR có thể đọc hai lựa chọn trên một dòng, ví dụ "A. 2 B.4".
        matches = list(OCR_OPTION.finditer(line))
        if matches and matches[0].start() == 0:
            for index, match in enumerate(matches):
                end = (
                    matches[index + 1].start()
                    if index + 1 < len(matches)
                    else len(line)
                )
                option = line[match.end():end].strip()
                lines.append(f"{match[1].upper()}. {option}")
        else:
            lines.append(line)

    # Giữ lại bảng đáp án để xử lý riêng sau khi ghép các trang.
    return "\n".join(lines)


def split_pdf_answer_key(text):
    lines = text.splitlines()
    seen_question = False

    for index, line in enumerate(lines):
        if QUESTION.match(line):
            seen_question = True
        if not seen_question:
            continue

        heading = KEY_HEADING.fullmatch(fold_text(line))
        if not heading:
            continue

        inline = heading[1]

        # "Đáp án: B" là đáp án của câu hiện tại, không phải bảng cuối đề.
        if inline and not KEY_ROW.fullmatch(inline):
            continue

        answers = {}
        conflicts = set()
        rows = ([inline] if inline else []) + lines[index + 1:]

        for raw in rows:
            entry = fold_text(raw)
            if not entry:
                continue
            if not KEY_ROW.fullmatch(entry):
                break

            for match in KEY_ENTRY.finditer(entry):
                number = int(match[1])
                answer = match[2]

                if number in answers and answers[number] != answer:
                    conflicts.add(number)

                answers[number] = answer

        for number in conflicts:
            answers.pop(number, None)

        warnings = [
            f"Bảng đáp án có nhiều lựa chọn khác nhau cho câu {number}."
            for number in sorted(conflicts)
        ]

        if not answers and not conflicts:
            warnings.append(
                "Tìm thấy bảng đáp án nhưng không đọc được các cặp số câu và đáp án."
            )

        return "\n".join(lines[:index]), answers, warnings

    return text, {}, []


def apply_pdf_answer_key(questions, answers):
    counts = Counter(question["sourceNumber"] for question in questions)

    for question in questions:
        number = question["sourceNumber"]
        if number not in answers:
            continue

        if counts[number] != 1:
            question["warnings"].append(
                "Số câu bị trùng; chưa ghép đáp án từ bảng."
            )
            continue

        answer = answers[number]
        current = question["correctAnswer"]

        if current is None:
            question["correctAnswer"] = answer
            question["warnings"] = [
                warning for warning in question["warnings"]
                if warning != MISSING_ANSWER
            ]
        elif current != answer:
            question["warnings"].append(
                "Đáp án ghi ngay dưới câu khác với bảng cuối đề; hãy kiểm tra lại."
            )


def extract_pdf(content):
    reader = PdfReader(BytesIO(content))
    if reader.is_encrypted:
        raise DocumentImportError("Chưa hỗ trợ PDF được bảo vệ bằng mật khẩu.")

    page_count = len(reader.pages)
    if not 1 <= page_count <= MAX_PDF_PAGES:
        raise DocumentImportError(
            f"PDF phải có từ 1 đến {MAX_PDF_PAGES} trang."
        )

    warnings = [
        "Đối chiếu công thức, bảng và đồ thị với PDF gốc. "
        "Bản nháp chỉ chứa văn bản."
    ]
    pages = []
    total_length = 0
    used_ocr = False

    with TemporaryDirectory(prefix="matchday-ocr-") as directory:
        source = Path(directory) / "source.pdf"

        for index, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""

            if not text.strip():
                if page_count > MAX_OCR_PAGES:
                    raise DocumentImportError(
                        "PDF scan tối đa 5 trang. Hãy tách file rồi tải lại."
                    )

                if not used_ocr:
                    source.write_bytes(content)
                    used_ocr = True

                prefix = Path(directory) / f"page-{index}"

                run_ocr_command(
                    [
                        "pdftoppm",
                        "-f", str(index),
                        "-l", str(index),
                        "-scale-to", "2400",
                        "-gray",
                        "-png",
                        "-singlefile",
                        str(source),
                        str(prefix),
                    ],
                    timeout=8,
                )

                text = run_ocr_command(
                    [
                        "tesseract",
                        str(prefix.with_suffix(".png")),
                        "stdout",
                        "-l", "vie+eng",
                        "--psm", "6",
                    ],
                    timeout=15,
                )

                if not text.strip():
                    raise DocumentImportError(
                        f"Không nhận dạng được chữ ở trang {index}."
                    )

                text = normalize_ocr_text(text)

            pages.append(text)
            total_length += len(text)
            if total_length > MAX_TEXT_LENGTH:
                raise DocumentImportError("Nội dung tài liệu quá dài.")

    if used_ocr:
        warnings.append(
            "Đã dùng OCR. Hãy kiểm tra dấu tiếng Việt, công thức "
            "và đáp án được nhận dạng với PDF gốc."
        )

    return "\n".join(pages), warnings


def extract_docx(content):
    warnings = []

    try:
        with ZipFile(BytesIO(content)) as archive:
            entries = archive.infolist()

            if len(entries) > 2000:
                raise DocumentImportError("DOCX chứa quá nhiều thành phần.")

            if sum(item.file_size for item in entries) > 40 * 1024 * 1024:
                raise DocumentImportError("DOCX quá lớn sau khi giải nén.")

            if any(item.flag_bits & 1 for item in entries):
                raise DocumentImportError("Chưa hỗ trợ DOCX được mã hóa.")

            xml = archive.read("word/document.xml")

            if any(item.filename.startswith("word/media/") for item in entries):
                warnings.append("DOCX có hình ảnh; bản nháp không giữ hình gốc.")

            if b"oMath" in xml:
                warnings.append(
                    "DOCX có công thức Word chưa được chuyển sang LaTeX."
                )
    except (BadZipFile, KeyError):
        raise DocumentImportError("File DOCX không hợp lệ.") from None

    document = Document(BytesIO(content))
    parts = []
    total_length = 0

    def add_part(text):
        nonlocal total_length
        total_length += len(text)
        if total_length > MAX_TEXT_LENGTH:
            raise DocumentImportError("Nội dung tài liệu quá dài.")
        parts.append(text)

    for block in document.iter_inner_content():
        if isinstance(block, Table):
            warnings.append(
                "Các ô trong bảng DOCX được đọc thành dòng chữ. "
                "Hãy kiểm tra lại bố cục."
            )
            for row in block.rows:
                for cell in row.cells:
                    add_part(cell.text)
        else:
            add_part(block.text)

    return "\n".join(parts), warnings


def parse_questions(text):
    questions = []
    current = None
    target = None

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue

        if UNSUPPORTED_SECTION.match(line):
            raise DocumentImportError(
                "Phát hiện phần đúng/sai, trả lời ngắn hoặc tự luận. "
                "Hãy tách phần trắc nghiệm A–D thành file riêng."
            )

        match = QUESTION.match(line)
        if match:
            if len(questions) >= MAX_QUESTIONS:
                raise DocumentImportError("Mỗi đề tối đa 100 câu.")

            current = {
                "sourceNumber": int(match[1]),
                "text": match[2].strip(),
                "options": {key: "" for key in "abcd"},
                "correctAnswer": None,
                "explanation": "",
                "warnings": [],
            }
            questions.append(current)
            target = ("text", None)
            continue

        if current is None:
            continue

        match = ANSWER.match(line)
        if match:
            answer = match[1].lower()
            if current["correctAnswer"] is None:
                current["correctAnswer"] = answer
            elif current["correctAnswer"] != answer:
                current["warnings"].append(
                    "Có nhiều dòng đáp án khác nhau; hãy kiểm tra lại."
                )
            target = None
            continue

        match = EXPLANATION.match(line)
        if match:
            current["explanation"] = match[1].strip()
            target = ("explanation", None)
            continue

        match = OPTION.match(line)
        if match:
            key = match[1].lower()
            if current["options"][key]:
                current["warnings"].append(
                    f"Lựa chọn {key.upper()} xuất hiện nhiều lần."
                )
            current["options"][key] = match[2].strip()
            target = ("options", key)
            continue

        if target is None:
            current["warnings"].append(
                "Có nội dung sau đáp án chưa được phân loại: " + line[:100]
            )
            continue

        field, key = target
        if field == "options":
            current[field][key] += "\n" + line
        else:
            current[field] += "\n" + line

    if not questions:
        raise DocumentImportError(
            "Không tìm thấy câu hỏi theo mẫu 'Câu 1.' hoặc 'Question 1.'."
        )

    for question in questions:
        if not question["text"].strip():
            question["warnings"].append("Thiếu nội dung câu hỏi.")

        for key, value in question["options"].items():
            if not value.strip():
                question["warnings"].append(f"Thiếu lựa chọn {key.upper()}.")

        if question["correctAnswer"] is None:
            question["warnings"].append(MISSING_ANSWER)

    return questions


def convert_document(content, filename):
    if not content:
        raise DocumentImportError("File đang trống.")

    if len(content) > MAX_DOCUMENT_BYTES:
        raise DocumentImportError("File tối đa 10 MB.")

    extension = Path(filename).suffix.lower()

    try:
        answer_key = {}

        if extension == ".pdf":
            if not content.startswith(b"%PDF-"):
                raise DocumentImportError("Nội dung không phải file PDF.")

            text, warnings = extract_pdf(content)
            text, answer_key, key_warnings = split_pdf_answer_key(text)
            warnings.extend(key_warnings)

        elif extension == ".docx":
            text, warnings = extract_docx(content)

        else:
            raise DocumentImportError("Chỉ hỗ trợ DOCX và PDF.")

        questions = parse_questions(text)

        if answer_key:
            apply_pdf_answer_key(questions, answer_key)

    except DocumentImportError:
        raise
    except Exception:
        raise DocumentImportError(
            "Không đọc được tài liệu. File có thể bị lỗi "
            "hoặc có định dạng chưa được hỗ trợ."
        ) from None

    warnings.append(
        "Đây là bản nháp chưa được xác minh. "
        "Kiểm tra từng câu với tài liệu gốc trước khi lưu."
    )

    return {
        "status": "draft",
        "sourceType": extension.lstrip("."),
        "requiresReview": True,
        "warnings": list(dict.fromkeys(warnings)),
        "exam": {
            "title": Path(filename).stem[:120],
            "durationMinutes": None,
            "questions": questions,
        },
    }