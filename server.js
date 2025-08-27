const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const xlsx = require('xlsx');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// 初始化Express应用
const app = express();
const port = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '.')));

// 数据库设置
const db = new sqlite3.Database('students.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the students database.');
    
    // 创建学生表
    db.run(`CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        serialNumber TEXT,
        name TEXT,
        major TEXT,
        className TEXT,
        studentId TEXT UNIQUE,
        gender TEXT,
        nationality TEXT,
        idCard TEXT UNIQUE,
        birthDate TEXT,
        dormitory TEXT,
        economicStatus TEXT,
        householdType TEXT,
        nativePlace TEXT,
        homeAddress TEXT,
        phone TEXT,
        fatherName TEXT,
        fatherPhone TEXT,
        motherName TEXT,
        motherPhone TEXT,
        qq TEXT,
        politicalStatus TEXT,
        specialty TEXT,
        religion TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // 创建管理员表
    db.run(`CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )`, (err) => {
        if (err) {
            console.error(err.message);
        }
        
        // 检查是否有默认管理员，如果没有则创建
        db.get("SELECT * FROM admins WHERE username = 'admin'", (err, row) => {
            if (!row) {
                const defaultPassword = 'admin123'; // 默认密码，建议首次登录后修改
                bcrypt.hash(defaultPassword, 10, (err, hash) => {
                    db.run(`INSERT INTO admins (username, password) VALUES (?, ?)`, 
                        ['admin', hash], 
                        (err) => {
                            if (err) {
                                console.error(err.message);
                            } else {
                                console.log('Default admin created: username=admin, password=admin123');
                            }
                        }
                    );
                });
            }
        });
    });
});

// JWT配置
const JWT_SECRET = 'your-secret-key'; // 生产环境中应使用更安全的密钥
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token == null) return res.sendStatus(401);
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// API路由

// 学生提交信息
app.post('/api/submit', (req, res) => {
    const studentData = req.body;
    
    // 检查必填字段
    const requiredFields = [
        'serialNumber', 'name', 'major', 'className', 'studentId', 
        'gender', 'nationality', 'idCard', 'birthDate', 'dormitory',
        'economicStatus', 'householdType', 'nativePlace', 'homeAddress',
        'phone', 'fatherName', 'fatherPhone', 'motherName', 'motherPhone',
        'qq', 'politicalStatus', 'specialty', 'religion'
    ];
    
    for (const field of requiredFields) {
        if (!studentData[field]) {
            return res.status(400).json({ error: `缺少必填字段: ${field}` });
        }
    }
    
    // 插入数据
    const fields = Object.keys(studentData).join(', ');
    const placeholders = Object.keys(studentData).map(() => '?').join(', ');
    const values = Object.values(studentData);
    
    db.run(`INSERT INTO students (${fields}) VALUES (${placeholders})`, values, function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed: students.studentId')) {
                return res.status(400).json({ error: '该学号已提交过信息' });
            }
            if (err.message.includes('UNIQUE constraint failed: students.idCard')) {
                return res.status(400).json({ error: '该身份证号已提交过信息' });
            }
            return res.status(500).json({ error: err.message });
        }
        
        res.status(200).json({ 
            message: '信息提交成功', 
            id: this.lastID 
        });
    });
});

// 教师登录
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get('SELECT * FROM admins WHERE username = ?', [username], (err, admin) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (!admin) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }
        
        bcrypt.compare(password, admin.password, (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            if (result) {
                // 生成JWT令牌
                const token = jwt.sign(
                    { username: admin.username },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );
                
                return res.status(200).json({ token });
            } else {
                return res.status(401).json({ error: '用户名或密码错误' });
            }
        });
    });
});

// 验证令牌
app.get('/api/verify-token', authenticateToken, (req, res) => {
    res.status(200).json({ valid: true });
});

// 获取所有学生信息
app.get('/api/students', authenticateToken, (req, res) => {
    db.all('SELECT * FROM students ORDER BY serialNumber', (err, students) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(200).json(students);
    });
});

// 获取单个学生信息
app.get('/api/students/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    
    db.get('SELECT * FROM students WHERE id = ?', [id], (err, student) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        if (!student) {
            return res.status(404).json({ error: '学生信息不存在' });
        }
        
        res.status(200).json(student);
    });
});

// 导出Excel
app.get('/api/export-excel', authenticateToken, (req, res) => {
    db.all('SELECT * FROM students ORDER BY serialNumber', (err, students) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        // 准备Excel数据
        const wsData = students.map(student => {
            return {
                '序号': student.serialNumber,
                '姓名': student.name,
                '专业': student.major,
                '所在班级': student.className,
                '学号': student.studentId,
                '性别': student.gender,
                '民族': student.nationality,
                '身份证号': student.idCard,
                '出生年月': student.birthDate,
                '宿舍': student.dormitory,
                '家庭经济情况': student.economicStatus,
                '户籍性质': student.householdType,
                '籍贯': student.nativePlace,
                '家庭住址': student.homeAddress,
                '手机号': student.phone,
                '父亲名字': student.fatherName,
                '父亲手机号': student.fatherPhone,
                '母亲姓名': student.motherName,
                '母亲手机号': student.motherPhone,
                'QQ号': student.qq,
                '政治面貌': student.politicalStatus,
                '特长': student.specialty,
                '宗教信仰': student.religion
            };
        });
        
        // 创建工作簿和工作表
        const ws = xlsx.utils.json_to_sheet(wsData);
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, '学生信息');
        
        // 生成Excel文件
        const buffer = xlsx.write(wb, { bookType: 'xlsx', type: 'buffer' });
        
        // 设置响应头并发送文件
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=学生信息汇总_${new Date().toLocaleDateString()}.xlsx`);
        res.send(buffer);
    });
});

// 静态页面路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/teacher', (req, res) => {
    res.sendFile(path.join(__dirname, 'teacher.html'));
});

// 启动服务器
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
