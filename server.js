const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// 配置中间件（解决跨域、解析JSON）
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // 前端文件存放目录

// 连接SQLite数据库（自动创建`student.db`文件）
const db = new sqlite3.Database('./student.db', (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  } else {
    console.log('已连接到SQLite数据库');
    // 初始化学生表（若不存在则创建，包含所有新字段）
    db.run(`CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      studentId TEXT NOT NULL,
      major TEXT NOT NULL,
      className TEXT NOT NULL,
      gender TEXT NOT NULL,
      ethnicity TEXT NOT NULL,
      idCard TEXT NOT NULL,
      birthDate TEXT NOT NULL,
      dormitory TEXT NOT NULL,
      phone TEXT NOT NULL,
      familyEconomy TEXT NOT NULL,
      householdType TEXT NOT NULL,
      nativePlace TEXT NOT NULL,
      homeAddress TEXT NOT NULL,
      fatherName TEXT NOT NULL,
      fatherPhone TEXT NOT NULL,
      motherName TEXT NOT NULL,
      motherPhone TEXT NOT NULL,
      qq TEXT NOT NULL,
      politicalStatus TEXT NOT NULL,
      specialty TEXT NOT NULL,
      religiousBelief TEXT NOT NULL,
      submitTime TEXT NOT NULL
    )`);
  }
});

// 接口1：学生提交信息（POST）
app.post('/api/submit', (req, res) => {
  const { 
    name, studentId, major, className, gender, ethnicity, idCard, birthDate, 
    dormitory, phone, familyEconomy, householdType, nativePlace, homeAddress, 
    fatherName, fatherPhone, motherName, motherPhone, qq, politicalStatus, 
    specialty, religiousBelief 
  } = req.body;
  const submitTime = new Date().toISOString(); // 记录提交时间

  // 插入数据库
  db.run(
    `INSERT INTO students (
      name, studentId, major, className, gender, ethnicity, idCard, birthDate, 
      dormitory, phone, familyEconomy, householdType, nativePlace, homeAddress, 
      fatherName, fatherPhone, motherName, motherPhone, qq, politicalStatus, 
      specialty, religiousBelief, submitTime
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name, studentId, major, className, gender, ethnicity, idCard, birthDate, 
      dormitory, phone, familyEconomy, householdType, nativePlace, homeAddress, 
      fatherName, fatherPhone, motherName, motherPhone, qq, politicalStatus, 
      specialty, religiousBelief, submitTime
    ],
    (err) => {
      if (err) {
        console.error('提交失败:', err.message);
        res.status(500).json({ success: false, message: '服务器内部错误' });
      } else {
        res.json({ success: true, message: '提交成功' });
      }
    }
  );
});

// 接口2：教师获取学生数据（GET，支持搜索/筛选）
app.get('/api/students', (req, res) => {
  const { search, major } = req.query;
  let sql = 'SELECT * FROM students';
  let params = [];

  // 构建查询条件（搜索/专业筛选）
  const conditions = [];
  if (search) {
    conditions.push(`(name LIKE ? OR studentId LIKE ? OR major LIKE ? OR ethnicity LIKE ? OR idCard LIKE ?)`);
    params = params.concat([`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]);
  }
  if (major && major !== '') {
    conditions.push(`major = ?`);
    params.push(major);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY submitTime DESC'; // 按提交时间倒序

  // 执行查询
  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('查询失败:', err.message);
      res.status(500).json({ success: false, message: '服务器内部错误' });
      return;
    }

    // 统计今日提交数
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = rows.filter(s => new Date(s.submitTime) >= today).length;

    res.json({
      success: true,
      list: rows,
      total: rows.length,
      today: todayCount,
      lastTime: rows.length > 0 ? rows[0].submitTime : null
    });
  });
});

// 前端页面路由（学生端+教师端）
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/teacher', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher.html'));
});

// 启动服务器
app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
});