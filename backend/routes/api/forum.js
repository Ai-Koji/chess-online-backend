var express = require('express');
var forum = express.Router();
const mysql = require('mysql');
const { MYSQL } = require('../../settings');
const multer = require('multer');
const upload = multer();
var auth = require('./auth');

// connect to mysql server
const connection = mysql.createConnection({
	host: MYSQL.host,
	user: MYSQL.user,
	password: MYSQL.password,
	database: MYSQL.name
});
connection.connect();

forum.use((_, res, next) => {
	res.append('Access-Control-Allow-Origin', ['*']);
	res.append('Access-Control-Allow-Headers', 'Content-Type');
	next();
});

forum.get('/main', (req, res) => {
	connection.query('SELECT * FROM Forums;', (err, result) => {
		if (err) res.sendStatus(500);
		else res.json(result);
	});
});

// send json: {header, discussions: [discussion...]}
forum.get('/discussions/:forumId', upload.none(), (req, res) => {
	let forumId = Number(req.params.forumId);

	if (!forumId) {
		res.sendStatus(400);
		return;
	}

	let sqlcode = `
		SELECT 
			id, 
			header, 
			answer_count, 
			DATE_FORMAT(create_date, '%d %b %Y') AS create_date 
		FROM Discussions 
		WHERE forum_id = ?;
	`;

	connection.query(sqlcode, [forumId], (err, result1) => {
		if (err) res.sendStatus(500);
		else {
			connection.query(
				'SELECT header FROM Forums WHERE id = ?;',
				[forumId],
				(err, result2) => {
					if (err) res.sendStatus(500);
					else
						res.json({
							header: result2[0].header,
							discussions: result1
						});
				}
			);
		}
	});
});

forum.get('/answers/:discussionId/:limit', upload.none(), (req, res) => {
	let limit = req.params.limit;
	let discussionId = req.params.discussionId;

	let sqlcode = `
        SELECT 
            Answers.content as content, 
            DATE_FORMAT(Answers.answer_date, '%d %b %Y %H:%i:%s') as date, 
            Users.login as username,
            IF(Users.id = (SELECT user_id FROM Discussions WHERE id = ${discussionId}), 1, 0) AS isAuthor
        FROM Answers 
        LEFT JOIN Users ON Users.id = Answers.user_id 
        WHERE Answers.discussion_id = ${discussionId} 
        ORDER BY Answers.answer_date ASC
        LIMIT ${limit};
    `;

	connection.query(sqlcode, (err, result1) => {
		if (err) res.sendStatus(500);
		else {
			connection.query(
				`SELECT header FROM Discussions WHERE id = ${discussionId} LIMIT 1;`,
				(err, result2) => {
					if (err) res.sendStatus(500);
					else
						res.json({
							header: result2[0].header,
							discussions: result1
						});
				}
			);
		}
	});
});

forum.post('/answer/:discussionId', upload.none(), (req, res) => {
	let cookies = auth.getCookies();
	let usersCookie = Object.keys(req.cookies)[0];

	if (!(usersCookie in cookies)) {
		res.clearCookie(Object.keys(req.cookies)[0]);
		res.statusMessage = 'no cookie';
		res.sendStatus(403); // redirect user to login page
		return;
	}
	usersCookie = cookies[usersCookie];

	let discussionId = req.params.discussionId;
	let content = req.body.message;
	let user_id = usersCookie.id;

	if (!content) {
		res.statusMessage = 'missing meaning';
		res.sendStatus(400);
		return;
	}

	const sqlcode = `
		INSERT INTO Answers (user_id, discussion_id, content, answer_date) 
		VALUES (?, ?, ?, NOW());
	`;
	connection.query(sqlcode, [user_id, discussionId, content], (err) => {
		if (err) res.sendStatus(500);
		else {
			res.sendStatus(200);

			connection.query(
				`
				UPDATE Forums
					SET messages_count = messages_count + 1
				WHERE id IN (SELECT forum_id FROM Discussions WHERE id = ?);
			`,
				[discussionId]
			);

			connection.query(
				`
				UPDATE Discussions
					SET answer_count = answer_count + 1
				WHERE id = ?;
			`,
				[discussionId]
			);
		}
	});
});

forum.post('/create-discussion', upload.none(), (req, res) => {
	let cookies = auth.getCookies();
	let usersCookie = Object.keys(req.cookies)[0];

	if (!(usersCookie in cookies)) {
		res.clearCookie(usersCookie);
		res.statusMessage = 'no cookie';
		res.sendStatus(403); // redirect user to login page
		return;
	}

	let forum_id = req.body.forum_class_id;
	let header = req.body.header;
	let content = req.body.message;
	let user_id = cookies[usersCookie].id;

	if (!(header && content)) {
		res.statusMessage = 'missing meaning';
		res.sendStatus(400);
		return;
	}

	const sqlcode1 = `
		INSERT INTO Discussions (forum_id, header, user_id) 
		VALUES (?, ?, ?);
	`;

	const sqlcode2 = `
		INSERT INTO Answers (user_id, discussion_id, content)
		VALUES (?, (SELECT MAX(id) FROM Discussions), ?);
	`;

	connection.query(sqlcode1, [forum_id, header, user_id], (err) => {
		if (err) res.sendStatus(500);
		else {
			connection.query(sqlcode2, [user_id, content], (err) => {
				if (err) res.sendStatus(500);
				else {
					let sqlcode3 = `
						UPDATE Forums
							SET
								topic_count = topic_count + 1,
								messages_count = messages_count + 1
						WHERE id = ?;
					`;
					connection.query(sqlcode3, [forum_id], (err) => {
						if (err) res.sendStatus(500);
						else {
							let sqlcode4 = `
								SELECT MAX(id) as discussionId FROM Discussions 
							`
							connection.query(sqlcode4, (err, result) => {
								if (err) res.sendStatus(500);
								else {
									res.json({result});
								}
								
							});
						}
					});
				}
			});
		}
	});
});

module.exports = forum;
