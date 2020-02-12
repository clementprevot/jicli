import JiraApi from 'jira-client';
import chalk from 'chalk';
import inquirer from 'inquirer';
import isEmpty from 'lodash/isEmpty';
import ora from 'ora';
import requireUp from 'require-up';

import JiraAPI from './jira';

const ERROR_CODES = {
    UNKNOWN: -1,
    OK: 0,
    CONFIG_NOT_FOUND: 1,
    CONFIG_INVALID: 2,
    JIRA_CONNECT_ERROR: 3,
    CURRENT_USER_NOT_FOUND: 4,
};

export async function cli(program, logger) {
    let spinner;

    spinner = ora('Loading Jira configuration...').start();

    let config;
    try {
        ({ default: config = {} } = requireUp(`${process.cwd()}/.jirarc`));

        if (!('host' in config)) {
            spinner.fail(
                chalk.bold.red('The configuration found is not valid! See ".config/.jirarc" for more information.'),
            );

            logger.error(chalk.bold.red(`Received configuration: ${JSON.stringify(config)}`));

            return ERROR_CODES.CONFIG_INVALID;
        }
    } catch (error) {
        spinner.fail(
            chalk.bold.red(
                'Please create the ".jirarc[.js|.json]" file to setup your Jira CLI! See ".config/.jirarc" for more information.',
            ),
        );

        return ERROR_CODES.CONFIG_NOT_FOUND;
    }

    spinner.succeed('Configuration loaded!');
    logger.info('');

    spinner = ora('Connecting to Jira...').start();

    let jiraClient;
    try {
        jiraClient = new JiraApi({
            protocol: 'https',
            apiVersion: '2',
            strictSSL: false,
            ...config,
        });
    } catch (error) {
        spinner.fail(chalk.red('An error occured while connecting to Jira!'));
        logger.error(error);

        return ERROR_CODES.JIRA_CONNECT_ERROR;
    }

    spinner.succeed(`Successfully connected to ${jiraClient.host} as ${config.username}!`);
    logger.info('');

    const jira = JiraAPI(config, jiraClient, logger);

    const currentUser = await jira.user.getCurrent();
    if (isEmpty(currentUser)) {
        return ERROR_CODES.CURRENT_USER_NOT_FOUND;
    }

    const boards = (await jira.board.list()) || [];
    let board = null;
    let project = null;
    let activeSprint = null;
    let futureSprints = [];

    if (config.defaultBoard) {
        board = await jira.board.get(config.defaultBoard);
        project = await jira.project.get(board.location.projectId);

        if (jira.board.supportSprints(board)) {
            activeSprint = await jira.board.getActiveSprint(board.id);
            futureSprints = await jira.board.listFutureSprints(board.id);
        }
    }

    logger.info('');

    const ACTIONS = {
        createTicket: 'createTicket',
        getTicket: 'getTicket',
        quit: 'quit',
    };

    let previousAction = null;
    while (previousAction !== ACTIONS.quit) {
        const { action } = await inquirer.prompt([
            {
                choices: [
                    { name: 'Create a ticket', value: ACTIONS.createTicket },
                    { name: 'Get a ticket', value: ACTIONS.getTicket },
                    { name: 'Quit', value: ACTIONS.quit },
                ],
                name: 'action',
                message: 'What do you want to do?',
                type: 'list',
            },
        ]);

        logger.info('');

        switch (action) {
            case ACTIONS.createTicket: {
                const { boardId } = await inquirer.prompt([
                    {
                        choices: boards.map(({ id, name }) => ({
                            name,
                            value: id,
                        })),
                        // eslint-disable-next-line no-loop-func
                        default: boards.findIndex(({ id }) => id === board.id),
                        name: 'boardId',
                        message: 'In which board do you want to create your issue?',
                        type: 'list',
                    },
                ]);

                if (boardId !== board.id) {
                    board = await jira.board.get(boardId);
                    project = await jira.project.get(board.location.projectId);

                    if (jira.board.supportSprints(board)) {
                        activeSprint = await jira.board.getActiveSprint(board.id);
                        futureSprints = await jira.board.listFutureSprints(board.id);
                    } else {
                        activeSprint = null;
                        futureSprints = [];
                    }

                    logger.info('');
                }

                let sprintChoices = [
                    {
                        name: `Don't assign ticket to a sprint`,
                        value: null,
                        short: 'No',
                    },
                ];
                if (!isEmpty(activeSprint)) {
                    sprintChoices = [
                        ...sprintChoices,
                        new inquirer.Separator(),
                        {
                            name: `${activeSprint.name} (current sprint)`,
                            value: activeSprint.id,
                            short: activeSprint.name,
                        },
                    ];
                }
                if (!isEmpty(futureSprints)) {
                    sprintChoices = [
                        ...sprintChoices,
                        new inquirer.Separator(),
                        ...futureSprints.map(({ id, name }) => ({ name, value: id })),
                    ];
                }

                if (!isEmpty(activeSprint) || !isEmpty(futureSprints)) {
                    sprintChoices = [...sprintChoices, new inquirer.Separator()];
                }

                const { ...fields } = await inquirer.prompt([
                    {
                        name: 'summary',
                        message: 'Enter the title',
                        type: 'input',
                    },
                    {
                        name: 'description',
                        message: 'Enter the description',
                        type: 'input',
                    },
                    {
                        choices: project.issueTypes.map(({ id, name }) => ({
                            name,
                            value: id,
                        })),
                        name: 'issueType',
                        message: 'Which type of ticket do you want to create?',
                        type: 'list',
                    },
                    {
                        name: 'labels',
                        message:
                            'Do you want to set any label on this ticket (comma separated list of labels, leave empty to ignore)?',
                        type: 'input',
                    },
                    {
                        choices: sprintChoices,
                        default: !isEmpty(activeSprint) ? 1 : 0,
                        name: 'sprintId',
                        message: 'Do you want to assign your ticket to a sprint?',
                        type: 'list',
                        when: jira.board.supportSprints(board),
                    },
                ]);

                const { key: ticketId } = await jira.ticket.create({
                    ...fields,
                    projectId: project.id,
                    assignee: currentUser,
                });
                if (!isEmpty(ticketId)) {
                    const ticket = await jira.ticket.get(ticketId);

                    logger.info('');
                    jira.ticket.display(ticket);
                }

                break;
            }

            case ACTIONS.getTicket: {
                const { ticketId } = await inquirer.prompt([
                    {
                        name: 'ticketId',
                        message: 'Enter the Jira ticket ID',
                        type: 'input',
                    },
                ]);

                const ticket = await jira.ticket.get(ticketId);

                if (!isEmpty(ticket)) {
                    logger.info('');
                    jira.ticket.display(ticket);
                }

                break;
            }

            default:
                break;
        }

        previousAction = action;

        logger.info('');
    }

    return ERROR_CODES.OK;
}
