import TerminalRenderer from 'marked-terminal';
import chalk from 'chalk';
import clipboardy from 'clipboardy';
import isEmpty from 'lodash/isEmpty';
import marked from 'marked';
import ora from 'ora';

marked.setOptions({
    renderer: new TerminalRenderer({
        tab: 2,
    }),
});

const BOARD_TYPES = {
    kanban: 'kanban',
    scrum: 'scrum',
    simple: 'simple',
};

const SPRINT_STATES = {
    active: 'active',
    closed: 'closed',
    future: 'future',
};

function formatDescription(description = '') {
    return marked(description.replace(/\[([^|]+)\|([^\]]+)\]/g, '$1 (_$2_)'));
}

function getTypeFormat({ name = '' } = {}) {
    let color;
    let icon;

    switch (name.toLowerCase()) {
        case 'bogue':
        case 'bug':
            color = chalk.red;
            icon = '🔴';
            break;

        case 'epic':
            color = chalk.magenta;
            icon = '⚡';
            break;

        case 'investigation':
            color = chalk.gray;
            icon = '🕵️';
            break;

        case 'sous-tâche':
        case 'subtask':
            color = chalk.blue;
            icon = '⭕';
            break;

        case 'tâche':
        case 'task':
            color = chalk.blue;
            icon = '☑';
            break;

        case 'story':
        case 'user story':
            color = chalk.green;
            icon = '🔖';
            break;

        case 'support':
        case 'aide informatique':
            color = chalk.gray;
            icon = '🆘';
            break;

        default:
            color = chalk.white;
            icon = '';
            break;
    }

    return {
        color,
        icon,
    };
}

export default ({ copyToClipboard = true, locale, username }, jiraClient, logger) => {
    const JIRA_BASE_URL = `${jiraClient.protocol}://${jiraClient.host}${
        jiraClient.port && ![80, 443].includes(jiraClient.port) ? `:${jiraClient.port}` : ''
    }`;

    function formatDate(date = new Date()) {
        const dateObject = typeof date === 'string' ? new Date(date) : date;

        return new Intl.DateTimeFormat(locale).format(dateObject);
    }

    function formatUser({ emailAddress, displayName = 'an unknown user' } = {}) {
        if (emailAddress === username) {
            return 'you';
        }

        return displayName;
    }

    async function getTicket(ticketId) {
        const spinner = ora(`Getting ticket ${ticketId}...`).start();

        let ticket;
        try {
            ticket = await jiraClient.findIssue(ticketId);
        } catch ({ statusCode, error: { errors } }) {
            spinner.fail(chalk.red(`An error occured while getting the ticket ${ticketId}!`));
            logger.error(`${statusCode} ${JSON.stringify(errors)}`);

            return null;
        }

        const url = `${JIRA_BASE_URL}/browse/${ticketId}`;

        if (copyToClipboard) {
            clipboardy.writeSync(url);
        }

        spinner.succeed(
            `Ticket ${ticketId} retrieved ${
                copyToClipboard ? '(the URL to the ticket has been copied in your clipboard)' : ''
            }`,
        );

        return {
            url,
            ...ticket,
        };
    }

    async function moveTicketToSprint(ticketId, sprintId) {
        const spinner = ora(`Moving ticket ${ticketId} to sprint ${sprintId}...`).start();

        try {
            await jiraClient.addIssueToSprint(ticketId, sprintId);

            spinner.succeed();

            return true;
        } catch ({ statusCode, error: { errors }, ...error }) {
            spinner.fail(chalk.red(`An error occured while moving the ticket ${ticketId} to the sprint ${sprintId}!`));
            logger.error(`${statusCode} ${JSON.stringify(errors)}`);
            logger.error(error);
        }

        return false;
    }

    return {
        BOARD_TYPES,
        JIRA_BASE_URL,
        SPRINT_STATES,

        board: {
            get: async (boardId) => {
                const spinner = ora(`Getting board ${boardId}...`).start();

                try {
                    const board = await jiraClient.getBoard(boardId);

                    spinner.succeed();

                    return board;
                } catch ({ statusCode, error: { errors } }) {
                    spinner.fail(chalk.red(`An error occured while getting the board ${boardId}!`));
                    logger.error(`${statusCode} ${JSON.stringify(errors)}`);

                    return null;
                }
            },
            getActiveSprint: async (boardId) => {
                const spinner = ora(`Getting active sprint for board ${boardId}...`).start();

                try {
                    const {
                        values: [activeSprint],
                    } = await jiraClient.getAllSprints(boardId, 0, 1, SPRINT_STATES.active);

                    spinner.succeed();

                    return activeSprint;
                } catch ({ statusCode, error: { errors } }) {
                    spinner.fail(
                        chalk.red(`An error occured while getting the active sprint for the board ${boardId}!`),
                    );
                    logger.error(`${statusCode} ${JSON.stringify(errors)}`);

                    return null;
                }
            },
            list: async () => {
                const spinner = ora('Getting the list of boards...').start();

                try {
                    const { values: boards, total } = await jiraClient.getAllBoards(0, 100);

                    spinner.succeed(
                        `${boards.length} (on ${total || boards.length}) board${boards.length > 1 ? 's' : ''} found`,
                    );

                    return boards;
                } catch ({ statusCode, error: { errors } }) {
                    spinner.fail(chalk.red(`An error occured while getting the list of boards!`));
                    logger.error(`${statusCode} ${JSON.stringify(errors)}`);

                    return null;
                }
            },
            listFutureSprints: async (boardId) => {
                const spinner = ora(`Getting future sprints for board ${boardId}...`).start();

                try {
                    const { values: futureSprints, total } = await jiraClient.getAllSprints(
                        boardId,
                        0,
                        100,
                        SPRINT_STATES.future,
                    );

                    spinner.succeed(
                        `${futureSprints.length} (on ${total || futureSprints.length}) future sprint${
                            futureSprints.length > 1 ? 's' : ''
                        } found`,
                    );

                    return futureSprints;
                } catch ({ statusCode, error: { errors } }) {
                    spinner.fail(
                        chalk.red(`An error occured while getting the future sprints for the board ${boardId}!`),
                    );
                    logger.error(`${statusCode} ${JSON.stringify(errors)}`);

                    return null;
                }
            },
            supportSprints: ({ type }) => [BOARD_TYPES.scrum, BOARD_TYPES.simple].includes(type),
        },
        project: {
            get: async (projectId) => {
                const spinner = ora(`Getting project ${projectId}...`).start();

                try {
                    const project = await jiraClient.getProject(projectId);

                    spinner.succeed();

                    return project;
                } catch ({ statusCode, error: { errors } }) {
                    spinner.fail(chalk.red(`An error occured while getting the project ${projectId}!`));
                    logger.error(`${statusCode} ${JSON.stringify(errors)}`);

                    return null;
                }
            },
        },
        ticket: {
            create: async ({ assignee, description, issueType, labels = [], projectId, sprintId, summary }) => {
                let spinner = ora(`Creating ticket "${summary}"...`).start();

                let ticket;
                try {
                    ticket = await jiraClient.addNewIssue({
                        fields: {
                            summary,
                            description,
                            labels: !isEmpty(labels) ? labels.split(',').map((label) => label.trim()) : undefined,
                            issuetype: {
                                id: issueType,
                            },
                            project: {
                                id: projectId,
                            },
                            assignee,
                        },
                    });
                } catch ({ statusCode, error: { errors } }) {
                    spinner.fail(chalk.red('An error occured while creating the ticket!'));
                    logger.error(`${statusCode} ${JSON.stringify(errors)}`);

                    return null;
                }

                spinner.succeed(`Ticket ${ticket.key} created!`);

                if (sprintId) {
                    spinner = ora(`Assigning ticket ${ticket.key} to sprint ${sprintId}...`).start();

                    const moved = await moveTicketToSprint(ticket.key, sprintId);
                    if (moved) {
                        spinner.succeed();
                    } else {
                        spinner.warn(chalk.yellow(`Unable to move ${ticket.key} to sprint ${sprintId}`));
                    }
                }

                return ticket;
            },
            display: ({ url, key: ticketId, fields: ticket = {} }) => {
                const { color, icon } = getTypeFormat(ticket.issuetype);

                const project = ticket.project || { name: 'an unknown project' };

                logger.info(
                    `${color(icon)} ${color('-')} ${color.bold(ticketId)} ${color('-')} ${color.bold(ticket.summary)}`,
                );
                logger.info('---------------------------------------------------------------');
                logger.info(chalk.white(formatDescription(ticket.description)));
                logger.info('---------------------------------------------------------------');
                logger.info(
                    chalk.cyan(`Created by ${chalk.bold(formatUser(ticket.creator))} on ${formatDate(ticket.created)}`),
                );
                logger.info(
                    chalk.cyan(
                        `Assigned to ${chalk.bold(formatUser(ticket.assignee))} in ${chalk.bold(
                            project.name,
                        )} (${chalk.dim(url)})`,
                    ),
                );
            },
            get: getTicket,
            moveToSprint: moveTicketToSprint,
        },
        user: {
            getCurrent: async () => {
                const spinner = ora(`Getting your user...`).start();

                try {
                    const currentUser = await jiraClient.getCurrentUser();

                    spinner.succeed();

                    return currentUser;
                } catch ({ statusCode, error: { errors } }) {
                    spinner.fail(chalk.red(`An error occured while getting your user!`));
                    logger.error(`${statusCode} ${JSON.stringify(errors)}`);

                    return null;
                }
            },
        },
    };
};
