from pydantic import BaseModel, ConfigDict, Field, model_validator

class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    display_name: str | None = Field(default =None, min_length=1, max_length=100)
    goal: str | None = Field(default=None, max_length=200)
    
    @model_validator(mode="after")
    def validate_update(self):
        if not self.model_fields_set:
            raise ValueError("Cần cung cấp ít nhất một trường để cập nhật.")
        
        if ("display_name" in self.model_fields_set and self.display_name is None):
            raise ValueError("Tên hiển thị không được để trống.")
        
        return self
    
class ProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="ignore")

    display_name: str
    goal: str | None = None