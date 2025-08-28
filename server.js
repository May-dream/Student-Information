const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const xlsx = require('xlsx');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// 初始化Express应用
const app = express();
const port = process.env.PORT || 3000;

// JWT密钥（实际部署时应使用环境变量）
const JWT_SECRET = 'your-secret-key-here'; // 建议更换为更安全的密钥

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '.')));

// 连接数据库
const db = new sqlite3.Database('students.db', (err) => {
    if (err) {
        console.error('数据库连接错误:', err.message);
    } else {
        console.log('成功连接到SQLite数据库');
        
        // 创建学生表
        db.run(`CREATE TABLE IF NOT EXISTS students (
            id TEXT PRIMARY KEY,
            serialNumber TEXT,
            name TEXT,
            major TEXT,
            className TEXT,
            studentId TEXT,
            gender TEXT,
            nationality TEXT,
            idCard TEXT,
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
            submitTime TEXT
        )`);
        
        // 创建管理员表
        db.run(`CREATE TABLE IF NOT EXISTS admin (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )`, (err) => {
            if (err) {
                console.error('创建管理员表错误:', err.message);
            } else {
                // 检查是否有默认管理员，如果没有则创建
                db.get("SELECT * FROM admin WHERE username = 'admin'", (err, row) => {
                    if (err) {
                        console.error('查询管理员错误:', err.message);
                    } else if (!row) {
                        // 默认密码: admin123
                        const hash = bcrypt.hashSync('admin123', 10);
                        db.run("INSERT INTO admin (username, password) VALUES (?, ?)", ['admin', hash], (err) => {
                            if (err) {
                                console.error('创建默认管理员错误:', err.message);
                            } else {
                                console.log('默认管理员创建成功');
                            }
                        });
                    }
                });
            }
        });
    }
});

// 生成唯一ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// 验证JWT令牌的中间件
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, message: '未提供令牌' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(401).json({ success: false, message: '令牌无效或已过期' });
        }
        req.user = user;
        next();
    });
}

// 路由 - 学生填写页面
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 路由 - 教师管理页面
app.get('/teacher', (req, res) => {
    res.sendFile(path.join(__dirname, 'teacher.html'));
});

// 路由 - 提交学生信息
app.post('/submit', (req, res) => {
    try {
        const studentData = req.body;
        
        // 简单验证必要字段
        if (!studentData.name || !studentData.studentId) {
            return res.status(400).json({ 
                success: false, 
                message: '姓名和学号为必填项' 
            });
        }
        
        // 添加唯一ID和提交时间
        const student = {
            ...studentData,
            id: generateId(),
            submitTime: new Date().toISOString()
        };
        
        // 插入数据库
        const fields = Object.keys(student).join(', ');
        const placeholders = Object.keys(student).map(() => '?').join(', ');
        const values = Object.values(student);
        
        db.run(`INSERT INTO students (${fields}) VALUES (${placeholders})`, values, function(err) {
            if (err) {
                console.error('插入学生数据错误:', err.message);
                return res.status(500).json({ 
                    success: false, 
                    message: '提交失败，请稍后重试' 
                });
            }
            
            res.json({ 
                success: true, 
                message: '提交成功，感谢您的配合' 
            });
        });
    } catch (error) {
        console.error('提交处理错误:', error);
        res.status(500).json({ 
            success: false, 
            message: '服务器错误，请稍后重试' 
        });
    }
});

// 路由 - 管理员登录
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ 
            success: false, 
            message: '请输入用户名和密码' 
        });
    }
    
    db.get("SELECT * FROM admin WHERE username = ?", [username], (err, user) => {
        if (err) {
            return res.status(500).json({ 
                success: false, 
                message: '登录失败，请稍后重试' 
            });
        }
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: '用户名或密码错误' 
            });
        }
        
        // 验证密码
        bcrypt.compare(password, user.password, (err, result) => {
            if (err || !result) {
                return res.status(401).json({ 
                    success: false, 
                    message: '用户名或密码错误' 
                });
            }
            
            // 生成JWT令牌
            const token = jwt.sign(
                { username: user.username },
                JWT_SECRET,
                { expiresIn: '7d' } // 7天有效期
            );
            
            res.json({
                success: true,
                token: token,
                message: '登录成功'
            });
        });
    });
});

// 路由 - 修改密码
app.post('/change-password', authenticateToken, (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const username = req.user.username;
    
    if (!oldPassword || !newPassword) {
        return res.status(400).json({ 
            success: false, 
            message: '请输入原密码和新密码' 
        });
    }
    
    if (newPassword.length < 6) {
        return res.status(400).json({ 
            success: false, 
            message: '新密码长度不能少于6位' 
        });
    }
    
    // 查询当前用户
    db.get("SELECT * FROM admin WHERE username = ?", [username], (err, user) => {
        if (err) {
            return res.status(500).json({ 
                success: false, 
                message: '操作失败，请稍后重试' 
            });
        }
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: '用户不存在' 
            });
        }
        
        // 验证原密码
        bcrypt.compare(oldPassword, user.password, (err, result) => {
            if (err || !result) {
                return res.status(401).json({ 
                    success: false, 
                    message: '原密码错误' 
                });
            }
            
            // 加密新密码并更新
            const newHash = bcrypt.hashSync(newPassword, 10);
            db.run("UPDATE admin SET password = ? WHERE username = ?", [newHash, username], (err) => {
                if (err) {
                    return res.status(500).json({ 
                        success: false, 
                        message: '密码修改失败，请稍后重试' 
                    });
                }
                
                res.json({
                    success: true,
                    message: '密码修改成功'
                });
            });
        });
    });
});

// 路由 - 获取所有学生信息
app.get('/students', authenticateToken, (req, res) => {
    db.all("SELECT * FROM students ORDER BY submitTime DESC", (err, rows) => {
        if (err) {
            return res.status(500).json({ 
                success: false, 
                message: '获取数据失败，请稍后重试' 
            });
        }
        
        res.json({
            success: true,
            students: rows
        });
    });
});

// 路由 - 导出Excel
app.get('/export', authenticateToken, (req, res) => {
    db.all("SELECT * FROM students ORDER BY submitTime DESC", (err, students) => {
        if (err) {
            return res.status(500).json({ 
                success: false, 
                message: '获取数据失败，请稍后重试' 
            });
        }
        
        try {
            // 准备Excel数据
            const data = students.map(student => {
                // 转换数据格式，只保留需要的字段
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
                    '宗教信仰': student.religion,
                    '提交时间': new Date(student.submitTime).toLocaleString()
                };
            });
            
            // 创建工作簿和工作表
            const ws = xlsx.utils.json_to_sheet(data);
            const wb = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(wb, ws, "学生信息");
            
            // 生成Excel文件
            const buffer = xlsx.write(wb, { bookType: 'xlsx', type: 'buffer' });
            
            // 设置响应头，让浏览器下载文件
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="学生信息汇总_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx"`);
            res.send(buffer);
        } catch (error) {
            console.error('导出Excel错误:', error);
            res.status(500).json({ 
                success: false, 
                message: '导出失败，请稍后重试' 
            });
        }
    });
});

// 启动服务器
app.listen(port, () => {
    console.log(`服务器启动成功，访问地址：http://localhost:${port}`);
});
