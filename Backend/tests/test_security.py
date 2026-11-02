from app.security import hash_password, verify_password

def test_correct_password():
    password = "Matchday123!"
    hashed = hash_password(password)
    
    assert hashed != password
    assert verify_password(password, hashed) is True
    
def test_wrong_password():
    hashed =  hash_password("Matchday123!")
    
    assert verify_password("WrongPassword!", hashed) is False

def test_same_password_produces_different_hashes():
    password = "Matchday123!"
    
    first_hash = hash_password(password)
    second_hash = hash_password(password)
    
    assert first_hash != second_hash
    assert verify_password(password, first_hash) is True
    assert verify_password(password, second_hash) is True