"use client"
import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import {
    Box,
    TextField,
    CircularProgress,
    Avatar,
    Typography,
    IconButton,
    Grid,
    ToggleButton,
    ToggleButtonGroup,
    Button,
} from '@mui/material';
import { Send as SendIcon } from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import { styled, keyframes } from '@mui/material/styles';
import { Line, Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend
);

// Fade-in animation for messages
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

// Transparent container for chat messages
const ChatContainer = styled(Box)(({ theme }) => ({
    height: '80vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'transparent',
    color: '#fff',
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(2),
    overflow: 'hidden',
}));

// Styled container for user questions with gradient background
const QuestionBox = styled(Box)(({ theme }) => ({
    alignSelf: 'flex-end',
    background: 'linear-gradient(45deg, #2196f3 30%, #21cbf3 90%)',
    color: '#fff',
    borderRadius: '20px 20px 20px 0',
    padding: theme.spacing(1.5),
    marginBottom: theme.spacing(1),
    display: 'inline-block',
    animation: `${fadeIn} 0.5s ease-out`,
}));

// Assistant answer text container
const AnswerText = styled(Box)(({ theme }) => ({
    alignSelf: 'flex-start',
    padding: theme.spacing(1.5),
    marginBottom: theme.spacing(2),
    maxWidth: '100%',
    lineHeight: 1.8,
    animation: `${fadeIn} 0.5s ease-out`,
    '& a': {
        color: '#2196f3 !important',
        textDecoration: 'underline',
        fontWeight: 500,
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
            color: '#1976d2 !important',
            textDecoration: 'none !important',
        }
    }
}));

// Container for chart toggle and chart display
const ChartContainerWrapper = styled(Box)(({ theme }) => ({
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(2),
}));

// ChartDisplay component for rendering charts
const ChartDisplay = ({ chartData, chartType, chartTitle }) => {
    const adjustedData = JSON.parse(JSON.stringify(chartData));
    if (chartType === 'bar') {
        adjustedData.datasets.forEach((dataset) => {
            delete dataset.tension;
            dataset.fill = true;
        });
    }
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: { color: '#fff' },
            },
            title: {
                display: true,
                text: chartTitle,
                color: '#fff',
                font: { size: 16 },
            },
        },
        scales: {
            x: {
                ticks: { color: '#fff' },
                grid: { color: 'rgba(255,255,255,0.2)' },
                title: {
                    display: true,
                    text:
                        adjustedData.labels &&
                        adjustedData.labels[0] &&
                        (adjustedData.labels[0].includes('-') || adjustedData.labels[0].includes('/'))
                            ? 'Time'
                            : 'Symbol',
                    color: '#fff',
                },
            },
            y: {
                ticks: { color: '#fff' },
                grid: { color: 'rgba(255,255,255,0.2)' },
                title: { display: true, text: 'Price (USD)', color: '#fff' },
            },
        },
    };

    return chartType === 'line' ? (
        <Line data={chartData} options={commonOptions} />
    ) : (
        <Bar data={adjustedData} options={commonOptions} />
    );
};

// Custom components for ReactMarkdown
const markdownComponents = {
    p: ({ node, ...props }) => (
        <p style={{ textAlign: 'justify', textIndent: '1em' }} {...props} />
    ),
    h1: ({ node, ...props }) => (
        <h1
            style={{
                margin: '1.2em 0 0.5em',
                paddingBottom: '0.3em',
                fontWeight: 'bold',
                textAlign: 'justify',
            }}
            {...props}
        />
    ),
    h2: ({ node, ...props }) => (
        <h2
            style={{
                margin: '1.2em 0 0.5em',
                paddingBottom: '0.3em',
                fontWeight: 'bold',
                textAlign: 'justify',
            }}
            {...props}
        />
    ),
    h3: ({ node, ...props }) => (
        <h3 style={{ margin: '1em 0 0.5em', fontWeight: 'bold', textAlign: 'justify' }} {...props} />
    ),
    li: ({ node, ordered, ...props }) => (
        <li style={{ marginBottom: '0.5em', marginLeft: '1em', textAlign: 'justify' }} {...props} />
    ),
    blockquote: ({ node, ...props }) => (
        <blockquote
            style={{
                borderLeft: '4px solid #4bd8d8',
                margin: '1em 0',
                paddingLeft: '1em',
                fontStyle: 'italic',
                color: '#ccc',
                textAlign: 'justify',
            }}
            {...props}
        />
    ),
    a: ({ node, ...props }) => (
        <a target="_blank" rel="noopener noreferrer" {...props} />
    )
};

export default function Chat() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [chartType, setChartType] = useState('line');
    const messagesEndRef = useRef(null);

    // Default example questions
    const defaultQuestions = [
        'top 2 stocks',
        'price of infosys stock',
    ];

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Send message function
    const sendMessage = async (messageContent) => {
        if (!messageContent.trim() || loading) return;
        setLoading(true);
        const userMessage = { role: 'user', content: messageContent };
        setMessages((prev) => [...prev, userMessage]);

        try {
            const { data } = await axios.post('/api/chat', {
                messages: [...messages, userMessage],
            });
            const assistantMessage = data;
            console.log(assistantMessage, "assistantMessage")
            // Process rawData (if provided) to build chartData and chart title
            if (assistantMessage.rawData && assistantMessage.rawData.length > 0) {
                let chartData;
                const assetNames = assistantMessage.rawData
                    .map((item) => item.name || item.symbol)
                    .filter(Boolean);
                let chartTitle = assetNames.join(' & ');

                if (assistantMessage.rawData[0].dates && assistantMessage.rawData[0].prices) {
                    if (assistantMessage.rawData[0].prices.length > 1) {
                        chartData = {
                            labels: assistantMessage.rawData[0].dates,
                            datasets: assistantMessage.rawData.map((item, index) => ({
                                label: item.symbol || 'Price',
                                data: item.prices,
                                fill: false,
                                borderColor: `hsl(${(index * 360) / assistantMessage.rawData.length}, 70%, 50%)`,
                                backgroundColor: `hsl(${(index * 360) / assistantMessage.rawData.length}, 70%, 50%)`,
                                tension: 0.1,
                            })),
                        };
                        chartTitle += ' Price History';
                    } else {
                        chartData = {
                            labels: assetNames,
                            datasets: [
                                {
                                    label: 'Current Price',
                                    data: assistantMessage.rawData.map((item) => item.prices[0]),
                                    backgroundColor: assistantMessage.rawData.map(
                                        (_, index) =>
                                            `hsl(${(index * 360) / assistantMessage.rawData.length}, 70%, 50%)`
                                    ),
                                    borderColor: assistantMessage.rawData.map(
                                        (_, index) =>
                                            `hsl(${(index * 360) / assistantMessage.rawData.length}, 70%, 50%)`
                                    ),
                                    borderWidth: 1,
                                },
                            ],
                        };
                        chartTitle += ' Current Price';
                    }
                } else if (assistantMessage.rawData[0].timestamp) {
                    const labels = assistantMessage.rawData.map((item) => item.timestamp);
                    const prices = assistantMessage.rawData.map((item) => item.price);
                    chartData = {
                        labels,
                        datasets: [
                            {
                                label: 'Price',
                                data: prices,
                                fill: false,
                                borderColor: '#4bd8d8',
                                backgroundColor: '#4bd8d8',
                                tension: 0.1,
                            },
                        ],
                    };
                    chartTitle += ' Price Trend';
                } else if (assistantMessage.rawData[0].price) {
                    const labels = assistantMessage.rawData.map(() =>
                        new Date().toLocaleTimeString()
                    );
                    const prices = assistantMessage.rawData.map((item) => item.price);
                    chartData = {
                        labels,
                        datasets: [
                            {
                                label: 'Price',
                                data: prices,
                                backgroundColor: '#4bd8d8',
                                borderColor: '#4bd8d8',
                                borderWidth: 1,
                            },
                        ],
                    };
                    chartTitle += ' Current Price';
                }
                assistantMessage.chartData = chartData;
                assistantMessage.chartTitle = chartTitle;
            }

            setMessages((prev) => [...prev, assistantMessage]);
        } catch (error) {
            console.error("Client-side error:", error);  // Log on the client-side too!
            setMessages((prev) => [
                ...prev,
                { role: '⚠️ I encountered an error. Please try again or ask about financial topics.' },
            ]);
        } finally {
            setLoading(false);
        }
    };

    // Handle form submit
    const handleSubmit = async (e) => {
        e.preventDefault();
        await sendMessage(input);
        setInput('');
    };

    // Handle default question click
    const handleExampleClick = (example) => {
        sendMessage(example);
    };

    const handleChartType = (event, newType) => {
        if (newType !== null) {
            setChartType(newType);
        }
    };

    return (
        <Box
            sx={{
                maxWidth: '800px',
                mx: 'auto',
                p: 2,
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'transparent',
                color: '#fff',
            }}
        >
            <Typography variant="h5" sx={{ mb: 3, fontWeight: 300, textAlign: 'center' }}>
                PROFIT FLOW
            </Typography>

            {/* Default Example Questions */}
            {messages.length === 0 && (
                <Box sx={{ mb: 2, display: 'flex', gap: 2, justifyContent: 'center' }}>
                    {defaultQuestions.map((question, idx) => (
                        <Button
                            key={idx}
                            variant="contained"
                            onClick={() => handleExampleClick(question)}
                            sx={{
                                borderRadius: '20px',
                                background: 'linear-gradient(45deg, #2196f3 30%, #21cbf3 90%)',
                                color: '#fff',
                                textTransform: 'none',
                                fontWeight: 600,
                                boxShadow: '0px 3px 5px -1px rgba(0,0,0,0.2)',
                                '&:hover': {
                                    background: 'linear-gradient(45deg, #21cbf3 30%, #2196f3 90%)',
                                },
                            }}
                        >
                            {question}
                        </Button>
                    ))}
                </Box>
            )}

            <ChatContainer>
                <Box
                    sx={{
                        flex: 1,
                        overflowY: 'auto',
                        pb: 1,
                        scrollbarWidth: 'none',
                        '&::-webkit-scrollbar': { display: 'none' },
                    }}
                >
                    {messages.map((msg, i) =>
                        msg.role === 'user' ? (
                            <QuestionBox key={i}>
                                <ReactMarkdown components={markdownComponents}>
                                    {msg.content}
                                </ReactMarkdown>
                            </QuestionBox>
                        ) : (
                            <AnswerText key={i}>
                                <ReactMarkdown components={markdownComponents}>
                                    {msg.content || 'Fetching real-time data...'}
                                </ReactMarkdown>
                                {msg.chartData && (
                                    <ChartContainerWrapper>
                                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                                            <ToggleButtonGroup
                                                value={chartType}
                                                exclusive
                                                onChange={handleChartType}
                                                size="small"
                                                sx={{
                                                    '& .MuiToggleButton-root': {
                                                        color: '#fff',
                                                        borderColor: '#444',
                                                        backgroundColor: 'transparent',
                                                    },
                                                    '& .Mui-selected': {
                                                        backgroundColor: '#444 !important',
                                                        color: '#fff',
                                                    },
                                                }}
                                            >
                                                <ToggleButton value="line" sx={{ textTransform: 'none' }}>
                                                    Line
                                                </ToggleButton>
                                                <ToggleButton value="bar" sx={{ textTransform: 'none' }}>
                                                    Bar
                                                </ToggleButton>
                                            </ToggleButtonGroup>
                                        </Box>
                                        <Box sx={{ width: '100%', height: '400px' }}>
                                            <ChartDisplay
                                                chartData={msg.chartData}
                                                chartType={chartType}
                                                chartTitle={msg.chartTitle}
                                            />
                                        </Box>
                                    </ChartContainerWrapper>
                                )}
                            </AnswerText>
                        )
                    )}
                    {loading && (
                        <AnswerText>
                            <Grid container spacing={1} alignItems="center">
                                <Grid item>
                                    <Avatar sx={{ width: 32, height: 32, bgcolor: '#444' }}>🤖</Avatar>
                                </Grid>
                                <Grid item>
                                    <CircularProgress size={20} sx={{ color: '#fff' }} />
                                </Grid>
                            </Grid>
                        </AnswerText>
                    )}
                    <div ref={messagesEndRef} />
                </Box>

                <Box
                    component="form"
                    onSubmit={handleSubmit}
                    sx={{
                        mt: 2,
                        display: 'flex',
                        gap: 1,
                    }}
                >
                    <TextField
                        fullWidth
                        variant="outlined"
                        size="small"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask for stock/crypto price"
                        sx={{
                            backgroundColor: '#1e1e1e',
                            borderRadius: '8px',
                            input: { color: '#fff' },
                        }}
                        InputProps={{
                            endAdornment: (
                                <IconButton type="submit" color="primary" disabled={loading}>
                                    <SendIcon />
                                </IconButton>
                            ),
                        }}
                    />
                </Box>
            </ChatContainer>
        </Box>
    );
}
