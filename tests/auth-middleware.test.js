// Comprehensive tests for auth middleware (verifyToken and requireRole)

const request = require('supertest');
const express = require('express');
const { verifyToken, requireRole } = require('../auth/middleware-supabase');

// Use the test setup to configure environment
require('./setup');

// Create test app for middleware testing
function createTestApp() {
	const app = express();
	app.use(express.json());

	// Test route: requires valid token
	app.get('/protected', verifyToken, (req, res) => {
		res.json({ user: req.user });
	});

	// Test route: requires specific role (admin)
	app.get('/admin-only', verifyToken, requireRole('admin'), (req, res) => {
		res.json({ user: req.user, message: 'admin access granted' });
	});

	// Test route: allows multiple roles
	app.get('/teacher-or-admin', verifyToken, requireRole('admin', 'teacher'), (req, res) => {
		res.json({ user: req.user, message: 'teacher or admin access' });
	});

	// Test route: requires all three roles
	app.get('/any-role', verifyToken, requireRole('admin', 'teacher', 'student'), (req, res) => {
		res.json({ user: req.user, message: 'any role access' });
	});

	return app;
}

describe('Auth Middleware', () => {
	let app;
	let consoleErrorSpy;

	beforeAll(() => {
		app = createTestApp();
		// Spy on console.error
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterAll(() => {
		consoleErrorSpy.mockRestore();
	});

	describe('verifyToken', () => {
		describe('in test mode', () => {
			it('accepts valid test token from Authorization header', async () => {
				const res = await request(app).get('/protected').set('Authorization', 'Bearer test-token-abc123');
				expect(res.status).toBe(200);
				expect(res.body.user).toBeDefined();
				expect(res.body.user.id).toMatch(/^test-user-\d+$/);
				expect(res.body.user.role).toBe('student');
			});

			it('returns 401 when token lacks Bearer prefix (no space)', async () => {
				const res = await request(app).get('/protected').set('Authorization', 'test-token-xyz789');
				expect(res.status).toBe(401);
				expect(res.body.error).toMatch(/no token/i);
			});

			it('extracts token from any prefix format "prefix token"', async () => {
				// The middleware splits on space and takes [1], so "CustomPrefix test-token" works
				const res = await request(app)
					.get('/protected')
					.set('Authorization', 'CustomPrefix test-token-abc');
				expect(res.status).toBe(200);
				expect(res.body.user).toBeDefined();
				expect(res.body.user.role).toBe('student');
			});

			it('rejects token not starting with test-token', async () => {
				const res = await request(app).get('/protected').set('Authorization', 'Bearer random-token');
				expect(res.status).toBe(403);
				expect(res.body.error).toMatch(/invalid|expired/i);
			});
		});

		describe('missing Authorization header', () => {
			it('returns 401 when no Authorization header', async () => {
				const res = await request(app).get('/protected');
				expect(res.status).toBe(401);
				expect(res.body.error).toMatch(/no token/i);
			});

			it('returns 401 when Authorization header is empty', async () => {
				const res = await request(app).get('/protected').set('Authorization', '');
				expect(res.status).toBe(401);
			});

			it('returns 401 when Authorization header has only Bearer', async () => {
				const res = await request(app).get('/protected').set('Authorization', 'Bearer');
				expect(res.status).toBe(401);
			});
		});

		describe('test mode token validation', () => {
			it('extracts user id from test token correctly', async () => {
				const res = await request(app).get('/protected').set('Authorization', 'Bearer test-token-12345');
				expect(res.status).toBe(200);
				expect(res.body.user.id).toBeTruthy();
			});

			it('default role is student for test tokens', async () => {
				const res = await request(app).get('/protected').set('Authorization', 'Bearer test-token-default-role');
				expect(res.status).toBe(200);
				expect(res.body.user.role).toBe('student');
			});
		});
	});

	describe('requireRole', () => {
		describe('when user has required role', () => {
			it('allows access for admin role', async () => {
				const adminApp = express();
				adminApp.get('/admin', (req, res, next) => {
					req.user = { id: 'admin-user', role: 'admin' };
					next();
				}, requireRole('admin'), (req, res) => {
					res.json({ success: true });
				});

				const res = await request(adminApp).get('/admin');
				expect(res.status).toBe(200);
				expect(res.body.success).toBe(true);
			});

			it('allows access for teacher role', async () => {
				const teacherApp = express();
				teacherApp.get('/teacher', (req, res, next) => {
					req.user = { id: 'teacher-user', role: 'teacher' };
					next();
				}, requireRole('teacher'), (req, res) => {
					res.json({ success: true });
				});

				const res = await request(teacherApp).get('/teacher');
				expect(res.status).toBe(200);
			});

			it('allows access when user has one of multiple allowed roles', async () => {
				const multiRoleApp = express();
				multiRoleApp.get('/multi', (req, res, next) => {
					req.user = { id: 'teacher-user', role: 'teacher' };
					next();
				}, requireRole('admin', 'teacher'), (req, res) => {
					res.json({ allowed: true });
				});

				const res = await request(multiRoleApp).get('/multi');
				expect(res.status).toBe(200);
				expect(res.body.allowed).toBe(true);
			});

			it('allows access when user has first role in list', async () => {
				const adminApp = express();
				adminApp.get('/first-role', (req, res, next) => {
					req.user = { id: 'admin-user', role: 'admin' };
					next();
				}, requireRole('admin', 'teacher', 'student'), (req, res) => {
					res.json({ allowed: true });
				});

				const res = await request(adminApp).get('/first-role');
				expect(res.status).toBe(200);
			});

			it('allows access when user has last role in list', async () => {
				const studentApp = express();
				studentApp.get('/last-role', (req, res, next) => {
					req.user = { id: 'student-user', role: 'student' };
					next();
				}, requireRole('admin', 'teacher', 'student'), (req, res) => {
					res.json({ allowed: true });
				});

				const res = await request(studentApp).get('/last-role');
				expect(res.status).toBe(200);
			});
		});

		describe('when user role does not match', () => {
			it('returns 403 when user role does not match required role', async () => {
				const restrictedApp = express();
				restrictedApp.get('/admin-only', (req, res, next) => {
					req.user = { id: 'student-user', role: 'student' };
					next();
				}, requireRole('admin'), (req, res) => {
					res.json({ success: true });
				});

				const res = await request(restrictedApp).get('/admin-only');
				expect(res.status).toBe(403);
				expect(res.body.error).toMatch(/insufficient|permissions/i);
			});

			it('returns 403 when user role is not in allowed roles list', async () => {
				const multiApp = express();
				multiApp.get('/multi', (req, res, next) => {
					req.user = { id: 'student-user', role: 'student' };
					next();
				}, requireRole('admin', 'teacher'), (req, res) => {
					res.json({ allowed: true });
				});

				const res = await request(multiApp).get('/multi');
				expect(res.status).toBe(403);
			});

			it('returns 403 when user undefined role', async () => {
				const weirdApp = express();
				weirdApp.get('/weird', (req, res, next) => {
					req.user = { id: 'user', role: undefined };
					next();
				}, requireRole('admin'), (req, res) => {
					res.json({ success: true });
				});

				const res = await request(weirdApp).get('/weird');
				expect(res.status).toBe(403);
			});
		});

		describe('when no user on request', () => {
			it('returns 401 when req.user is undefined', async () => {
				const noUserApp = express();
				noUserApp.get('/protected', requireRole('admin'), (req, res) => {
					res.json({ success: true });
				});

				const res = await request(noUserApp).get('/protected');
				expect(res.status).toBe(401);
				expect(res.body.error).toMatch(/not authenticated/i);
			});

			it('returns 401 when req.user is null', async () => {
				const nullUserApp = express();
				nullUserApp.get('/protected', (req, res, next) => {
					req.user = null;
					next();
				}, requireRole('admin'), (req, res) => {
					res.json({ success: true });
				});

				const res = await request(nullUserApp).get('/protected');
				expect(res.status).toBe(401);
			});

			it('returns 401 when requireRole is applied without verifyToken', async () => {
				const appWithoutVerify = express();
				appWithoutVerify.get('/protected', requireRole('student'), (req, res) => {
					res.json({ success: true });
				});

				const res = await request(appWithoutVerify).get('/protected');
				expect(res.status).toBe(401);
			});
		});
	});

	describe('middleware chaining', () => {
		it('verifies token then checks role in sequence', async () => {
			const chainedApp = express();
			chainedApp.get('/chained', verifyToken, requireRole('admin'), (req, res) => {
				res.json({ user: req.user });
			});

			// Valid token but student role (admin required)
			const res = await request(chainedApp).get('/chained').set('Authorization', 'Bearer test-token-stud');
			expect(res.status).toBe(403);
		});

		it('allows access with valid token and matching role', async () => {
			const adminTestApp = express();
			adminTestApp.get('/admin', verifyToken, (req, res, next) => {
				req.user = { id: req.user.id, role: 'admin' };
				next();
			}, requireRole('admin', 'teacher'), (req, res) => {
				res.json({ allowed: true });
			});

			const res = await request(adminTestApp).get('/admin').set('Authorization', 'Bearer test-token-admin');
			expect(res.status).toBe(200);
		});
	});

	describe('edge cases', () => {
		it('handles empty role array when no user', async () => {
			const noUserApp = express();
			noUserApp.get('/empty', requireRole(), (req, res) => {
				res.json({ success: true });
			});

			const res = await request(noUserApp).get('/empty');
			expect(res.status).toBe(401);
		});

		it('handles empty role array when user exists', async () => {
			const emptyRoleApp = express();
			emptyRoleApp.get('/empty', (req, res, next) => {
				req.user = { id: 'user', role: 'student' };
				next();
			}, requireRole(), (req, res) => {
				res.json({ success: true });
			});

			const res = await request(emptyRoleApp).get('/empty');
			expect(res.status).toBe(403);
		});

		it('handles user with empty role string', async () => {
			const emptyRoleApp = express();
			emptyRoleApp.get('/empty-role', (req, res, next) => {
				req.user = { id: 'user', role: '' };
				next();
			}, requireRole('admin'), (req, res) => {
				res.json({ success: true });
			});

			const res = await request(emptyRoleApp).get('/empty-role');
			expect(res.status).toBe(403);
		});
	});
});