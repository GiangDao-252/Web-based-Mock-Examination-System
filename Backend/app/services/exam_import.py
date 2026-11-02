import json

from pydantic import ValidationError

from app.schemas.exam import ExamCreate


MAX_FILE_BYTES = 1024 * 1024


class ExamImportError(ValueError):
    pass


def _reject_duplicate_keys(pairs):
    result = {}

    for key, value in pairs:
        if key in result:
            raise ExamImportError(
                f"File JSON chứa khóa bị trùng: {key}"
            )
        result[key] = value

    return result


def _reject_invalid_constant(value):
    raise ExamImportError(
        f"Giá trị không hợp lệ trong JSON: {value}"
    )


def parse_exam_file(content: bytes) -> ExamCreate:
    if not content:
        raise ExamImportError("File đề thi đang trống.")

    if len(content) > MAX_FILE_BYTES:
        raise ExamImportError("File đề thi không được vượt quá 1 MB.")

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ExamImportError(
            "File JSON phải dùng mã hóa UTF-8."
        ) from None

    try:
        payload = json.loads(
            text,
            object_pairs_hook=_reject_duplicate_keys,
            parse_constant=_reject_invalid_constant,
        )
    except (json.JSONDecodeError, RecursionError):
        raise ExamImportError(
            "Nội dung file không phải JSON hợp lệ."
        ) from None

    try:
        return ExamCreate.model_validate(payload)
    except ValidationError:
        raise ExamImportError(
            "Đề thi không đúng cấu trúc. Kiểm tra tên đề, "
            "thời lượng, câu hỏi, bốn lựa chọn và đáp án đúng."
        ) from None