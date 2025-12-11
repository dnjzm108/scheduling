// src/pages/UserEdit/index.jsx
import React, { useEffect, useState } from "react";
import api from "../../utils/api";
import "./index.css";
import Header from "../Header";
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function UserEdit() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState("profile"); // profile | password

  const [form, setForm] = useState({
    name: "",
    phone: "",
    resident_id: "",
    bank_name: "",
    bank_account: "",
    account_holder: "",
  });

  const [newPassword, setNewPassword] = useState("");

  // -------------------------
  // 하이픈 자동 생성 함수들
  // -------------------------
  const formatPhone = (value) => {
    const onlyNum = value.replace(/[^0-9]/g, "");
    if (onlyNum.length < 4) return onlyNum;
    if (onlyNum.length < 8)
      return `${onlyNum.slice(0, 3)}-${onlyNum.slice(3)}`;
    return `${onlyNum.slice(0, 3)}-${onlyNum.slice(3, 7)}-${onlyNum.slice(7, 11)}`;
  };

  const formatResidentId = (value) => {
    const onlyNum = value.replace(/[^0-9]/g, "");
    if (onlyNum.length <= 6) return onlyNum;
    return `${onlyNum.slice(0, 6)}-${onlyNum.slice(6, 13)}`;
  };

  // ★ 계좌번호: BACKSPACE 시 포맷 적용 안됨 ★
  const formatBankAccount = (value) => {
    const onlyNum = value.replace(/[^0-9]/g, "");
    if (onlyNum.length < 4) return onlyNum;
    if (onlyNum.length < 7)
      return `${onlyNum.slice(0, 4)}-${onlyNum.slice(4)}`;
    if (onlyNum.length < 12)
      return `${onlyNum.slice(0, 4)}-${onlyNum.slice(4, 7)}-${onlyNum.slice(7)}`;
    return `${onlyNum.slice(0, 4)}-${onlyNum.slice(4, 7)}-${onlyNum.slice(7, 12)}-${onlyNum.slice(12, 17)}`;
  };

  let isDeleting = false; // 🔥 백스페이스 감지 변수

  // --------------------------
  // input 핸들러 (자동 하이픈)
  // --------------------------
  const handleChange = (e) => {
    const { name, value } = e.target;

    // 백스페이스라면 하이픈 적용 없이 그대로 유지
    if (isDeleting) {
      setForm({ ...form, [name]: value });
      return;
    }

    let formatted = value;

    if (name === "phone") formatted = formatPhone(value);
    if (name === "resident_id") formatted = formatResidentId(value);
    if (name === "bank_account") formatted = formatBankAccount(value);

    setForm({ ...form, [name]: formatted });
  };

  // 🔥 keyDown으로 백스페이스 감지
  const handleKeyDown = (e) => {
    isDeleting = e.key === "Backspace";
  };


  // --------------------------
  // 내 정보 불러오기
  // --------------------------
  const loadUser = async () => {
    try {
      const res = await api.get("/api/user");
      setUser(res.data);

      const formatted = {
        ...res.data,
        phone: formatPhone(res.data.phone || ""),
        resident_id: formatResidentId(res.data.resident_id || ""),
        bank_account: formatBankAccount(res.data.bank_account || ""),
      };

      setForm(formatted);
    } catch (err) {
      if (err.message !== '중복 요청 취소') {
        toast.error('유저 정보 로드 실패');
        console.error("유저 정보 로드 실패:", err);
      }
    }
  };

  useEffect(() => {
    loadUser();
  }, []);

  // --------------------------
  // 개인정보 저장
  // --------------------------
  const saveProfile = async () => {
    try {
      const cleanData = {
        ...form,
        phone: form.phone.replace(/-/g, ""),
        resident_id: form.resident_id.replace(/-/g, ""),
        bank_account: form.bank_account.replace(/-/g, "")
      };

      await api.put(`/api/user/${user.id}/personal`, cleanData);

      toast.success("개인정보 수정 완료!");
      loadUser();
    } catch (err) {
      console.error(err);
        toast.error("수정 실패");
    }
  };

  // --------------------------
  // 비밀번호 변경
  // --------------------------
  const changePassword = async () => {
    if (!newPassword || newPassword.length < 4) {
        toast.success("비밀번호는 4자 이상이어야 합니다.");
      return;
    }

    try {
      await api.put(`/api/user/${user.id}/password/personal`, {
        password: newPassword
      });
    toast.success("비밀번호 변경 완료!");
      setNewPassword("");
    } catch (err) {
      console.error(err);
       toast.error("비밀번호 변경 실패");
    }
  };

  if (!user) return <div>로딩중...</div>;

  return (
    <div className="edit-container">
      <Header title="내 정보 관리" backTo="/myschedules" />

      {/* ----------------------------
          탭 버튼
      ----------------------------- */}
      <div className="mode-tabs">
        <button
          className={mode === "profile" ? "tab active" : "tab"}
          onClick={() => setMode("profile")}
        >
          개인정보 수정
        </button>

        <button
          className={mode === "password" ? "tab active" : "tab"}
          onClick={() => setMode("password")}
        >
          비밀번호 변경
        </button>
      </div>

      {/* ----------------------------
          개인정보 수정 화면
      ----------------------------- */}
      {mode === "profile" && (
        <div>
          <div className="form-grid">
            <label>이름</label>
            <input name="name" value={form.name} onChange={handleChange} />

            <label>전화번호</label>
            <input name="phone" value={form.phone} onChange={handleChange} />

            <label>주민등록번호</label>
            <input
              name="resident_id"
              maxLength={14}
              value={form.resident_id || ""}
              onChange={handleChange}
            />

            <label>은행명</label>
            <input
              name="bank_name"
              value={form.bank_name || ""}
              onChange={handleChange}
            />

            <label>계좌번호</label>
            <input
              name="bank_account"
              value={form.bank_account || ""}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
            />


            <label>예금주</label>
            <input
              name="account_holder"
              value={form.account_holder || ""}
              onChange={handleChange}
            />
          </div>

          <button className="save-btn" onClick={saveProfile}>
            저장하기
          </button>
        </div>
      )}

      {/* ----------------------------
          비밀번호 변경 화면
      ----------------------------- */}
      {mode === "password" && (
        <div>
          <div className="form-row">
            <label>새 비밀번호</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="4자리 이상 입력"
            />
          </div>

          <button className="save-btn" onClick={changePassword}>
            비밀번호 변경
          </button>
        </div>
      )}
            <ToastContainer position="top-right" theme="colored" autoClose={3000} />
    </div>
  );
}
